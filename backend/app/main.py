from pathlib import Path
import re

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, select, text

from .config import settings
from .database import Base, SessionLocal, engine
from .auth import ensure_admin_account
from .models import BonusContent, CharacterProfile, FriendLink, GalleryPhoto, Post, ScheduleItem, SiteContent, SiteStats, SocialLink
from .routers import admin, public
from .routers.admin import DEFAULT_BONUS_MESSAGE
from .site_content import iter_default_site_content
from .utils import save_optimized_image_content


def create_app() -> FastAPI:
    app = FastAPI(
        title="Lingxun Website Admin API",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    def browser_error(request: Request, code: int):
        if (request.method not in {'GET', 'HEAD'} or 'text/html' not in request.headers.get('accept', '')
                or request.url.path.startswith(('/api/', '/uploads/', '/_astro/', '/admin/assets/'))):
            return None
        page = code if code in {403, 404, 500, 503} else 500 if code >= 500 else 404
        for path in (settings.dist_dir / f'{page}.html', settings.dist_dir / str(page) / 'index.html'):
            if path.is_file():
                return FileResponse(path, status_code=code, headers={'Cache-Control': 'no-store'})
        return None

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        response = browser_error(request, exc.status_code)
        if response:
            response.headers.update(exc.headers or {})
            return response
        return await http_exception_handler(request, exc)

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception):
        return browser_error(request, 500) or JSONResponse(
            {'detail': '服务暂时出现问题，请稍后重试。'}, status_code=500,
            headers={'Cache-Control': 'no-store'},
        )

    @app.middleware("http")
    async def add_security_headers(request, call_next):
        response = await call_next(request)
        path = request.url.path
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        if response.status_code >= 400:
            response.headers['Cache-Control'] = 'no-store'
        elif path.startswith("/admin") or path.startswith("/api/admin"):
            response.headers["Cache-Control"] = "no-store"
        elif path.startswith("/_astro") or path.startswith("/uploads"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif response.headers.get('content-type', '').startswith('text/html'):
            response.headers.setdefault('Cache-Control', 'no-cache, must-revalidate')
        elif path.startswith('/fonts/'):
            response.headers['Cache-Control'] = 'public, max-age=604800'
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
    app.mount("/admin/assets", StaticFiles(directory=settings.admin_static_dir), name="admin-assets")

    app.include_router(public.router)
    app.include_router(admin.router)

    @app.on_event("startup")
    def startup() -> None:
        existing_tables = set(inspect(engine).get_table_names())
        Base.metadata.create_all(bind=engine)
        initialize_stories = ensure_database_schema()
        with SessionLocal() as db:
            ensure_admin_account(db)
            if initialize_stories:
                migrate_current_character(db)
            if not db.get(BonusContent, 1):
                db.add(BonusContent(id=1, typewriter_message=DEFAULT_BONUS_MESSAGE))
                db.commit()
            if not db.get(SiteStats, 1):
                db.add(SiteStats(id=1, visit_count=0, interaction_count=0))
                db.commit()
            if "schedule_items" not in existing_tables:
                db.add_all(ScheduleItem(**item) for item in DEFAULT_SCHEDULES)
                db.commit()
            if "social_links" not in existing_tables:
                db.add_all(SocialLink(**item) for item in DEFAULT_SOCIALS)
                db.commit()
            if "friend_links" not in existing_tables:
                db.add_all(FriendLink(**item) for item in DEFAULT_FRIENDS)
                db.commit()
            if "character_profiles" not in existing_tables:
                seed_characters(db)
            if "gallery_photos" not in existing_tables:
                seed_gallery(db)
            if "posts" not in existing_tables:
                seed_posts(db)
            ensure_site_content(db)
            migrate_contact_copy(db)
            if initialize_stories:
                migrate_character_story(db)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/admin")
    @app.get("/admin/")
    def admin_index():
        return FileResponse(settings.admin_static_dir / "index.html")

    if settings.dist_dir.exists():
        assets_dir = settings.dist_dir / "_astro"
        if assets_dir.exists():
            app.mount("/_astro", StaticFiles(directory=assets_dir), name="astro-assets")

    @app.get("/")
    def root():
        return serve_static_site("")

    @app.get("/{full_path:path}")
    def static_site(full_path: str):
        return serve_static_site(full_path)

    return app


def ensure_database_schema() -> bool:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    column_details = {
        table: {column["name"]: column for column in inspector.get_columns(table)}
        for table in ("bonus_content", "posts", "gallery_photos", "character_profiles", "social_links")
        if table in table_names
    }
    table_columns = {table: set(columns) for table, columns in column_details.items()}
    with engine.begin() as connection:
        if "character_ids" not in table_columns.get("gallery_photos", set()):
            connection.execute(text("ALTER TABLE gallery_photos ADD COLUMN character_ids JSON NULL"))
        for column_name, column_type in {
            "category": "VARCHAR(80) NOT NULL DEFAULT ''",
            "date": "VARCHAR(32) NOT NULL DEFAULT ''",
            "location": "VARCHAR(180) NOT NULL DEFAULT ''",
            "is_home_hero": "BOOLEAN NOT NULL DEFAULT FALSE",
            "hero_order": "INT NOT NULL DEFAULT 0",
            "is_home_portrait": "BOOLEAN NOT NULL DEFAULT FALSE",
            "is_home_gallery": "BOOLEAN NOT NULL DEFAULT FALSE",
            "home_order": "INT NOT NULL DEFAULT 0",
        }.items():
            if column_name not in table_columns.get("gallery_photos", set()):
                connection.execute(text(f"ALTER TABLE gallery_photos ADD COLUMN {column_name} {column_type}"))
        for column_name in ("image_urls", "attachments", "links"):
            if column_name not in table_columns.get("posts", set()):
                connection.execute(text(f"ALTER TABLE posts ADD COLUMN {column_name} JSON NULL"))
        for column_name, column_type in {
            "is_pinned": "BOOLEAN NOT NULL DEFAULT FALSE",
            "pin_order": "INT NOT NULL DEFAULT 0",
            "is_character_story": "BOOLEAN NOT NULL DEFAULT FALSE",
            "story_order": "INT NOT NULL DEFAULT 0",
            "story_summary": "TEXT NOT NULL DEFAULT ''",
            "story_character_id": "INT NULL",
            "story_cover_url": "VARCHAR(500) NULL",
        }.items():
            if column_name not in table_columns.get("posts", set()):
                if engine.dialect.name == "mysql" and column_name == "story_summary":
                    column_type = "TEXT NULL"
                connection.execute(text(f"ALTER TABLE posts ADD COLUMN {column_name} {column_type}"))
        for column_name, column_type in {
            "details": "TEXT NOT NULL DEFAULT ''",
            "custom_fields": "JSON NULL",
        }.items():
            if column_name not in table_columns.get("character_profiles", set()):
                if engine.dialect.name == "mysql" and column_name == "details":
                    column_type = "TEXT NULL"
                connection.execute(text(f"ALTER TABLE character_profiles ADD COLUMN {column_name} {column_type}"))
        # TEXT literal defaults are not portable to MySQL. Also resume a partially applied DDL upgrade.
        if engine.dialect.name == "mysql":
            for table, column in (("posts", "story_summary"), ("character_profiles", "details")):
                if column_details.get(table, {}).get(column, {}).get("nullable", True):
                    connection.execute(text(f"UPDATE {table} SET {column} = '' WHERE {column} IS NULL"))
                    connection.execute(text(f"ALTER TABLE {table} MODIFY COLUMN {column} TEXT NOT NULL"))
        if engine.dialect.name == "mysql" and "social_links" in table_names:
            connection.execute(text("ALTER TABLE social_links MODIFY COLUMN icon VARCHAR(500) NOT NULL DEFAULT ''"))

    bonus_columns = table_columns.get("bonus_content", set())
    bonus_text_columns = {
        "birthday_title": "BIRTHDAY",
        "birthday_subtitle": "诞生之日",
        "love_title": "FALL_IN_LOVE",
        "love_subtitle": "和小狼恋爱",
        "site_title": "WEBSITE_BIRTH",
        "site_subtitle": "网站上线",
        "future_title": "FUTURE_X",
        "future_subtitle": "观测未定",
    }

    with engine.begin() as connection:
        for column_name, default_value in bonus_text_columns.items():
            if "bonus_content" in table_names and column_name not in bonus_columns:
                connection.execute(
                    text(
                        f"ALTER TABLE bonus_content "
                        f"ADD COLUMN {column_name} VARCHAR(80) NOT NULL DEFAULT '{default_value}'"
                    )
                )


    return "is_character_story" not in table_columns.get("posts", set())


def migrate_current_character(db) -> None:
    character = db.scalar(select(CharacterProfile).where(CharacterProfile.name == "凌巽"))
    if not character:
        return

    changed = False
    if character.introduction in {
        "一条住在人类城镇里的纯龙，可靠地接下委托，也会在酒馆里给自己留一张桌子。",
        "一条住在人类城镇里的龙，接公会委托，也会在酒馆里给自己留一张桌子。",
    }:
        character.introduction = "一条住在人类城镇里的龙，接公会委托谋生，平时喜欢在家读魔法书。"
        changed = True
    if character.species == "龙族":
        character.species = "风龙"
        changed = True
    if character.role == "冒险者":
        character.role = "法师 / 冒险者"
        changed = True
    if changed:
        db.commit()


def ensure_site_content(db) -> None:
    existing = set(db.scalars(select(SiteContent.key)).all())
    missing = [SiteContent(**item) for item in iter_default_site_content() if item["key"] not in existing]
    if missing:
        db.add_all(missing)
        db.commit()


def migrate_contact_copy(db) -> int:
    # Only replace shipped defaults. Owner-written copy must survive upgrades.
    defaults = {
        "navbar.contact": ("酒馆入口", "联系凌巽", "联系方式菜单名称", "联系凌巽菜单名称"),
        "final.contact_eyebrow": ("酒馆入口 / Find Lingxun", "联系凌巽 / Find Lingxun", "联系眉题", "联系凌巽眉题"),
        "navbar.empty": ("暂无入口", "暂无联系方式", None, None),
        "common.back_home": ("返回酒馆入口", "返回首页", None, None),
    }
    changed = 0
    for row in db.scalars(select(SiteContent).where(SiteContent.key.in_(defaults))):
        old, new, old_label, new_label = defaults[row.key]
        updated = False
        if row.value == old:
            row.value = new
            updated = True
        if old_label and row.label == old_label:
            row.label = new_label
            updated = True
        changed += int(updated)
    if changed:
        db.commit()
    return changed


def migrate_character_story(db) -> None:
    story = db.scalar(select(Post).where(Post.slug == "post-lingxun-s_story"))
    if not story:
        return

    changed = False
    if not db.scalar(select(Post.id).where(Post.is_character_story.is_(True)).limit(1)):
        story.is_character_story = True
        story.story_order = 1
        story.story_summary = story.desc
        character = db.scalar(select(CharacterProfile).order_by(CharacterProfile.sort_order.asc(), CharacterProfile.id.asc()))
        story.story_character_id = character.id if character else None
        changed = True
    if not db.scalar(select(Post.id).where(Post.is_pinned.is_(True)).limit(1)):
        story.is_pinned = True
        story.pin_order = 1
        changed = True
    if changed:
        db.commit()


def ensure_qq_group(db) -> None:
    group = next(item for item in DEFAULT_SOCIALS if item["link"] == "https://qm.qq.com/q/hrqvQDmSjK")
    if db.scalar(select(SocialLink.id).where(SocialLink.link == group["link"])):
        return
    db.add(SocialLink(**group))
    db.commit()


def seed_characters(db) -> None:
    db.add(
        CharacterProfile(
            name="凌巽",
            alias="Lingxun",
            species="风龙",
            role="法师 / 冒险者",
            region="人类城镇",
            work="冒险者公会委托",
            places="公会 / 酒馆 / 家中",
            status="可接受委托",
            introduction="一条住在人类城镇里的龙，接公会委托谋生，平时喜欢在家读魔法书。",
            image_url="/src/assets/gallery/photo3.webp",
            sort_order=1,
            is_visible=True,
        )
    )
    db.commit()


def serve_static_site(full_path: str):
    if not settings.dist_dir.exists():
        return {"message": "Lingxun admin API is running.", "admin": "/admin"}

    normalized = full_path.strip("/")
    candidates = []
    if not normalized:
        candidates.append(settings.dist_dir / "index.html")
    else:
        requested = settings.dist_dir / normalized
        candidates.append(requested)
        candidates.append(requested / "index.html")

    dist_root = settings.dist_dir.resolve()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except FileNotFoundError:
            continue
        if dist_root in resolved.parents or resolved == dist_root:
            if resolved.is_file():
                return FileResponse(resolved)

    raise HTTPException(status_code=404, detail="Page not found")


def seed_gallery(db) -> None:
    gallery_dir = settings.project_dir / "src" / "assets" / "gallery"
    if not gallery_dir.exists():
        return

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    target_dir = settings.upload_dir / "gallery"
    target_dir.mkdir(parents=True, exist_ok=True)

    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    photos = sorted(path for path in gallery_dir.iterdir() if path.suffix.lower() in allowed)
    for index, source in enumerate(photos, start=1):
        target_name = f"default-{source.stem}.webp"
        target = target_dir / target_name
        if not target.exists():
            file_url = save_optimized_image_content(
                source.read_bytes(),
                source.suffix.lower(),
                "gallery",
                max_dimension=1280,
                quality=76,
            )
        else:
            file_url = f"/uploads/gallery/{target_name}"
        db.add(
            GalleryPhoto(
                title=source.stem,
                description="",
                file_url=file_url,
                original_filename=source.name,
                sort_order=index,
                is_visible=True,
                character_ids=[1],
            )
        )
    db.commit()


def seed_posts(db) -> None:
    posts_dir = settings.project_dir / "src" / "content" / "posts"
    if not posts_dir.exists():
        return

    for source in sorted(posts_dir.glob("*.md")):
        text = source.read_text(encoding="utf-8")
        meta, content = parse_markdown_post(text)
        db.add(
            Post(
                slug=source.stem,
                title=meta.get("title") or source.stem,
                date=meta.get("date") or "2026.01.01",
                tag=meta.get("tag") or "UPDATE",
                desc=meta.get("desc") or "",
                content=content.strip(),
                is_published=True,
            )
        )
    db.commit()


def parse_markdown_post(text: str) -> tuple[dict[str, str], str]:
    match = re.match(r"^---\s*\n(?P<meta>[\s\S]*?)\n---\s*\n?(?P<body>[\s\S]*)$", text)
    if not match:
        return {}, text

    meta: dict[str, str] = {}
    for line in match.group("meta").splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = value.strip().strip('"').strip("'")
        meta[key.strip()] = value
    return meta, match.group("body")


app = create_app()


DEFAULT_SCHEDULES = [
    {
        "code": "con-01",
        "name": "绒爪兽聚",
        "location": "重庆 · 南岸区",
        "start_date": "2026-05-02",
        "end_date": "2026-05-04",
        "description": "小龙第一次参加兽聚",
        "sort_order": 1,
        "is_visible": True,
    },
    {
        "code": "con-02",
        "name": "福瑞八奇物志",
        "location": "成都 · 武侯区",
        "start_date": "2026-07-24",
        "end_date": "2026-07-26",
        "description": "暑期档兽聚，会带着新装备和新物料登场（？",
        "sort_order": 2,
        "is_visible": True,
    },
    {
        "code": "con-03",
        "name": "你好兽聚HiFurry",
        "location": "广州",
        "start_date": "2026-10-01",
        "end_date": "2026-10-04",
        "description": "预计参加，目前正在准备相关的物料。",
        "sort_order": 3,
        "is_visible": True,
    },
]


DEFAULT_SOCIALS = [
    {
        "name": "QQ",
        "icon": "QQ",
        "desc": "日常交流 / 扩列",
        "link": "https://qm.qq.com/q/v6P80LZUdM",
        "number": "1651388504",
        "sort_order": 1,
        "is_visible": True,
    },
    {
        "name": "QQ 群",
        "icon": "QQ",
        "desc": "群聊 / 交流",
        "link": "https://qm.qq.com/q/hrqvQDmSjK",
        "number": "1105367000",
        "sort_order": 2,
        "is_visible": True,
    },
    {
        "name": "X (Twitter)",
        "icon": "X",
        "desc": "动态 / 日常",
        "link": "https://x.com/furrylingxun",
        "number": "",
        "sort_order": 3,
        "is_visible": True,
    },
    {
        "name": "BiliBili",
        "icon": "B",
        "desc": "视频 Vlog / 短视频",
        "link": "https://space.bilibili.com/362846640",
        "number": "",
        "sort_order": 4,
        "is_visible": True,
    },
    {
        "name": "抖音",
        "icon": "D",
        "desc": "短视频 / 日常掉落",
        "link": "https://v.douyin.com/LsGqWRTDUKc/",
        "number": "",
        "sort_order": 5,
        "is_visible": True,
    },
    {
        "name": "小红书",
        "icon": "R",
        "desc": "动态 / 日常",
        "link": "https://www.xiaohongshu.com/user/profile/69c665ea0000000034019dd1",
        "number": "",
        "sort_order": 6,
        "is_visible": True,
    },
]


DEFAULT_FRIENDS = [
    {
        "display_id": "寒杳",
        "avatar_url": "https://lingxun.me/logo.png",
        "url": "https://hanyao.me/",
        "comment": "站主的对象，一只银白色的小狼，头像暂时用本龙的代替（？",
        "sort_order": 1,
        "is_visible": True,
    },
    {
        "display_id": "lolpzili",
        "avatar_url": "https://www.lolpzili.com/img/avatar.webp",
        "url": "https://furry.lolpzili.com/",
        "comment": "一个年（都不一定）更的博主x",
        "sort_order": 2,
        "is_visible": True,
    },
    {
        "display_id": "LinFun_",
        "avatar_url": "https://images-r2.lin-fun.com/92dcd0d286189a611cf38ebe85e9df94.png",
        "url": "https://blog.lin-fun.com",
        "comment": "遇见更好的Fun",
        "sort_order": 3,
        "is_visible": True,
    },
    {
        "display_id": "Redflag",
        "avatar_url": "",
        "url": "",
        "comment": "是一只来自北方的狼，和网站主人是舍友（由于还没有个人网站所以头像是空的，点击也不会跳转w）",
        "sort_order": 4,
        "is_visible": True,
    },
    {
        "display_id": "滚木",
        "avatar_url": "",
        "url": "",
        "comment": "滚木滚木滚木（实际上是占位名片，也算...一个小彩蛋吧）",
        "sort_order": 5,
        "is_visible": True,
    },
]
