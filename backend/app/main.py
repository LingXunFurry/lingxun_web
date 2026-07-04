from pathlib import Path
import re
import shutil

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .config import settings
from .database import Base, SessionLocal, engine
from .models import BonusContent, FriendLink, GalleryPhoto, Post, ScheduleItem, SiteStats, SocialLink
from .routers import admin, public
from .routers.admin import DEFAULT_BONUS_MESSAGE


def create_app() -> FastAPI:
    app = FastAPI(title="Lingxun Website Admin API", version="1.0.0")

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
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            if not db.get(BonusContent, 1):
                db.add(BonusContent(id=1, typewriter_message=DEFAULT_BONUS_MESSAGE))
                db.commit()
            if not db.get(SiteStats, 1):
                db.add(SiteStats(id=1, visit_count=0, interaction_count=0))
                db.commit()
            if not db.scalar(select(ScheduleItem.id).limit(1)):
                db.add_all(ScheduleItem(**item) for item in DEFAULT_SCHEDULES)
                db.commit()
            if not db.scalar(select(SocialLink.id).limit(1)):
                db.add_all(SocialLink(**item) for item in DEFAULT_SOCIALS)
                db.commit()
            if not db.scalar(select(FriendLink.id).limit(1)):
                db.add_all(FriendLink(**item) for item in DEFAULT_FRIENDS)
                db.commit()
            if not db.scalar(select(GalleryPhoto.id).limit(1)):
                seed_gallery(db)
            if not db.scalar(select(Post.id).limit(1)):
                seed_posts(db)

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
        target_name = f"default-{source.name}"
        target = target_dir / target_name
        if not target.exists():
            shutil.copy2(source, target)
        db.add(
            GalleryPhoto(
                title=source.stem,
                description="",
                file_url=f"/uploads/gallery/{target_name}",
                original_filename=source.name,
                sort_order=index,
                is_visible=True,
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
        "name": "X (Twitter)",
        "icon": "X",
        "desc": "动态 / 日常",
        "link": "https://x.com/furrylingxun",
        "number": "",
        "sort_order": 2,
        "is_visible": True,
    },
    {
        "name": "BiliBili",
        "icon": "B",
        "desc": "视频 Vlog / 短视频",
        "link": "https://space.bilibili.com/362846640",
        "number": "",
        "sort_order": 3,
        "is_visible": True,
    },
    {
        "name": "抖音",
        "icon": "D",
        "desc": "短视频 / 日常掉落",
        "link": "https://v.douyin.com/LsGqWRTDUKc/",
        "number": "",
        "sort_order": 4,
        "is_visible": True,
    },
    {
        "name": "小红书",
        "icon": "R",
        "desc": "动态 / 日常",
        "link": "https://www.xiaohongshu.com/user/profile/69c665ea0000000034019dd1",
        "number": "",
        "sort_order": 5,
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
