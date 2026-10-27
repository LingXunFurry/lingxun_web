import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import case, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..auth import authenticate_admin, change_admin_password, create_access_token, require_admin
from ..config import settings
from ..database import get_db
from ..models import AdminAccount, BonusContent, CharacterProfile, FriendLink, GalleryPhoto, Post, PostComment, ScheduleItem, SiteContent, SocialLink
from ..schemas import (
    BonusContentIn,
    BonusContentOut,
    CharacterProfileIn,
    CharacterProfileOut,
    CharacterProfilePatch,
    FriendLinkIn,
    FriendLinkOut,
    FriendLinkPatch,
    GalleryPhotoOut,
    GalleryPhotoUpdate,
    HomepageMediaIn,
    OptimizeImageIn,
    LoginRequest,
    PasswordChangeRequest,
    PostCommentOut,
    PostCommentPatch,
    PostIn,
    PostOut,
    PostPatch,
    ScheduleItemIn,
    ScheduleItemOut,
    ScheduleItemPatch,
    SiteContentOut,
    SiteContentPatch,
    SocialLinkIn,
    SocialLinkOut,
    SocialLinkPatch,
    TokenResponse,
)
from ..utils import save_attachment_upload, save_image_upload, slugify
from ..media import image_info, optimize_uploaded_url


router = APIRouter(prefix="/api/admin", tags=["admin"])


def make_token_response(account: AdminAccount) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(account),
        expires_in=settings.jwt_expire_minutes * 60,
    )


def unique_slug(db: Session, value: str, current_id: int | None = None) -> str:
    base = slugify(value)
    slug = base
    index = 2
    while True:
        query = select(Post).where(Post.slug == slug)
        if current_id is not None:
            query = query.where(Post.id != current_id)
        exists = db.scalar(query)
        if not exists:
            return slug
        slug = f"{base}-{index}"
        index += 1


def parse_character_ids(value: str) -> list[int]:
    try:
        parsed = json.loads(value or "[]")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="角色绑定数据格式不正确。") from exc
    if not isinstance(parsed, list) or any(not isinstance(item, int) for item in parsed):
        raise HTTPException(status_code=400, detail="角色绑定数据格式不正确。")
    return sorted(set(parsed))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    account = authenticate_admin(db, payload.username, payload.password)
    if not account:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码不正确。")
    return make_token_response(account)


@router.post("/session/refresh", response_model=TokenResponse)
def refresh_session(admin: str = Depends(require_admin), db: Session = Depends(get_db)):
    account = db.scalar(select(AdminAccount).where(AdminAccount.username == admin))
    if not account:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录状态已失效，请重新登录。")
    return make_token_response(account)


@router.post("/change-password")
def change_password(payload: PasswordChangeRequest, db: Session = Depends(get_db)):
    account = change_admin_password(db, payload.username, payload.current_password, payload.new_password)
    if not account:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或旧密码不正确。")
    return {"ok": True}


@router.get("/me")
def me(admin: str = Depends(require_admin)):
    return {"username": admin}


@router.get("/gallery", response_model=list[GalleryPhotoOut])
def admin_list_gallery(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(GalleryPhoto).order_by(GalleryPhoto.sort_order.asc(), GalleryPhoto.id.desc())
    return db.scalars(query).all()


@router.put('/homepage/media')
def save_homepage_media(payload: HomepageMediaIn, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    if len(set(payload.hero_ids)) != len(payload.hero_ids) or len(set(payload.gallery_ids)) != len(payload.gallery_ids):
        raise HTTPException(422, '同一展示区域不能重复选择照片。')
    selected = set(payload.hero_ids + payload.gallery_ids + ([payload.portrait_id] if payload.portrait_id is not None else []))
    photos = db.scalars(select(GalleryPhoto).with_for_update()).all()
    visible_ids = {photo.id for photo in photos if photo.is_visible}
    if not selected.issubset(visible_ids):
        raise HTTPException(422, '有照片已隐藏或删除，请刷新后重新选择。')
    for photo in photos:
        photo.is_home_hero = photo.id in payload.hero_ids
        photo.hero_order = payload.hero_ids.index(photo.id) if photo.is_home_hero else 0
        photo.is_home_portrait = photo.id == payload.portrait_id
        photo.is_home_gallery = photo.id in payload.gallery_ids
        photo.home_order = payload.gallery_ids.index(photo.id) if photo.is_home_gallery else 0
    marker = db.scalar(select(SiteContent).where(SiteContent.key == 'home.media_managed'))
    if not marker:
        marker = SiteContent(key='home.media_managed', group_name='internal', label='首页图片显式编排', content_type='internal', sort_order=99999)
        db.add(marker)
    marker.value = 'true'
    db.commit()
    return {'ok': True, **payload.model_dump()}


@router.post('/media/optimize')
async def optimize_image(payload: OptimizeImageIn, _: str = Depends(require_admin)):
    return await run_in_threadpool(optimize_uploaded_url, payload.url)


@router.get('/media')
def list_media(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    records = {}
    def add(url, title, location):
        if not url or not url.startswith('/uploads/'):
            return
        if url in records:
            records[url]['locations'].append(location)
        else:
            records[url] = {'url': url, 'title': title, 'locations': [location], 'image': image_info(url)}
    for photo in db.scalars(select(GalleryPhoto)).all():
        add(photo.file_url, photo.title or photo.original_filename, '旅途留影')
    for post in db.scalars(select(Post)).all():
        add(post.cover_url, post.title, '动态封面')
        add(post.story_cover_url, post.title, '角色故事独立封面')
        for url in post.image_urls or []:
            add(url, post.title, '动态配图')
    for character in db.scalars(select(CharacterProfile)).all():
        add(character.image_url, character.name, '冒险者登记簿')
    for item in db.scalars(select(SiteContent).where(SiteContent.content_type == 'image')).all():
        add(item.value, item.label, '站点图片')
    return list(records.values())


@router.post("/gallery", response_model=GalleryPhotoOut)
async def create_gallery_photo(
    title: str = Form(""),
    description: str = Form(""),
    category: str = Form(""),
    date: str = Form(""),
    location: str = Form(""),
    sort_order: int = Form(0),
    is_visible: bool = Form(True),
    character_ids: str = Form("[]"),
    is_home_hero: bool = Form(False),
    hero_order: int = Form(0),
    is_home_portrait: bool = Form(False),
    is_home_gallery: bool = Form(False),
    home_order: int = Form(0),
    file: UploadFile = File(...),
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    file_url = await save_image_upload(file, "gallery", max_dimension=1920, quality=80)
    photo = GalleryPhoto(
        title=title,
        description=description,
        category=category,
        date=date,
        location=location,
        sort_order=sort_order,
        is_visible=is_visible,
        file_url=file_url,
        original_filename=file.filename or "",
        character_ids=parse_character_ids(character_ids),
        is_home_hero=is_home_hero,
        hero_order=hero_order,
        is_home_portrait=is_home_portrait,
        is_home_gallery=is_home_gallery,
        home_order=home_order,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo


@router.post("/characters/upload-image")
async def upload_character_image(
    file: UploadFile = File(...),
    _: str = Depends(require_admin),
):
    return {"file_url": await save_image_upload(file, "character_profiles", max_dimension=1600, quality=80)}


@router.post("/socials/upload-icon")
async def upload_social_icon(
    file: UploadFile = File(...),
    _: str = Depends(require_admin),
):
    return {"file_url": await save_image_upload(file, "social_icons", max_dimension=256, quality=88)}


@router.patch("/gallery/{photo_id}", response_model=GalleryPhotoOut)
def update_gallery_photo(
    photo_id: int,
    payload: GalleryPhotoUpdate,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    photo = db.get(GalleryPhoto, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在。")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(photo, field, value)
    db.commit()
    db.refresh(photo)
    return photo


@router.delete("/gallery/{photo_id}")
def delete_gallery_photo(photo_id: int, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    photo = db.get(GalleryPhoto, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在。")
    db.delete(photo)
    db.commit()
    return {"ok": True}


@router.post("/gallery/{photo_id}/image", response_model=GalleryPhotoOut)
async def replace_gallery_image(
    photo_id: int,
    file: UploadFile = File(...),
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    photo = db.get(GalleryPhoto, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在。")
    # Keep the old file for rollback and other records that may still reference it.
    photo.file_url = await save_image_upload(file, "gallery", max_dimension=1920, quality=80)
    photo.original_filename = file.filename or ""
    db.commit()
    db.refresh(photo)
    return photo


@router.get("/posts", response_model=list[PostOut])
def admin_list_posts(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(Post).order_by(Post.is_pinned.desc(), case((Post.is_pinned.is_(True), Post.pin_order), else_=0).asc(), Post.date.desc(), Post.id.desc())
    return db.scalars(query).all()


@router.post("/posts", response_model=PostOut)
def create_post(payload: PostIn, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    if payload.story_character_id is not None and db.get(CharacterProfile, payload.story_character_id) is None:
        raise HTTPException(status_code=422, detail="关联角色不存在，请重新选择。")
    slug_source = payload.slug or payload.title
    post = Post(
        slug=unique_slug(db, slug_source),
        title=payload.title,
        date=payload.date,
        tag=payload.tag,
        desc=payload.desc,
        content=payload.content,
        cover_url=payload.cover_url,
        image_urls=payload.image_urls,
        attachments=payload.attachments,
        links=payload.links,
        is_published=payload.is_published,
        is_pinned=payload.is_pinned,
        pin_order=payload.pin_order,
        is_character_story=payload.is_character_story,
        story_order=payload.story_order,
        story_summary=payload.story_summary,
        story_character_id=payload.story_character_id,
        story_cover_url=payload.story_cover_url,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


@router.patch("/posts/{post_id}", response_model=PostOut)
def update_post(post_id: int, payload: PostPatch, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="动态不存在。")
    data = payload.model_dump(exclude_unset=True)
    if any(value is None for field, value in data.items() if field not in {"cover_url", "story_cover_url", "story_character_id", "image_urls", "attachments", "links"}):
        raise HTTPException(status_code=422, detail="动态文本、状态和排序字段不能为 null。")
    if any(field in data and not data[field].strip() for field in ("title", "date", "slug")):
        raise HTTPException(status_code=422, detail="标题、日期和地址不能为空。")
    if data.get("story_character_id") is not None and db.get(CharacterProfile, data["story_character_id"]) is None:
        raise HTTPException(status_code=422, detail="关联角色不存在，请重新选择。")
    if "slug" in data and data["slug"]:
        data["slug"] = unique_slug(db, data["slug"], current_id=post.id)
    for field, value in data.items():
        setattr(post, field, value)
    db.commit()
    db.refresh(post)
    return post


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="动态不存在。")
    db.delete(post)
    db.commit()
    return {"ok": True}


@router.post("/posts/upload-cover")
async def upload_post_cover(
    file: UploadFile = File(...),
    _: str = Depends(require_admin),
):
    url = await save_image_upload(file, "post_covers", max_dimension=1600, quality=80)
    return {"file_url": url, "image": image_info(url)}


@router.post("/posts/upload-images")
async def upload_post_images(
    files: list[UploadFile] = File(...),
    _: str = Depends(require_admin),
):
    return {"file_urls": [await save_image_upload(file, "post_covers", max_dimension=1280, quality=76) for file in files]}


@router.post("/posts/upload-attachments")
async def upload_post_attachments(
    files: list[UploadFile] = File(...),
    _: str = Depends(require_admin),
):
    return {"file_urls": [await save_attachment_upload(file) for file in files]}


@router.get("/site-content", response_model=list[SiteContentOut])
def admin_list_site_content(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(SiteContent).order_by(SiteContent.sort_order.asc(), SiteContent.id.asc())
    return db.scalars(query).all()


@router.patch("/site-content/{content_id}", response_model=SiteContentOut)
def update_site_content(
    content_id: int,
    payload: SiteContentPatch,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    item = db.get(SiteContent, content_id)
    if not item:
        raise HTTPException(status_code=404, detail="站点内容项不存在。")
    item.value = payload.value
    db.commit()
    db.refresh(item)
    return item


@router.post("/site-content/upload-image")
async def upload_site_content_image(
    file: UploadFile = File(...),
    _: str = Depends(require_admin),
):
    return {"file_url": await save_image_upload(file, "site_content", max_dimension=1920, quality=82)}


@router.get("/comments", response_model=list[PostCommentOut])
def admin_list_comments(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(PostComment).order_by(PostComment.created_at.desc(), PostComment.id.desc())
    return db.scalars(query).all()


@router.patch("/comments/{comment_id}", response_model=PostCommentOut)
def admin_update_comment(
    comment_id: int,
    payload: PostCommentPatch,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    comment = db.get(PostComment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="留言不存在。")

    data = payload.model_dump(exclude_unset=True)
    if "author_id" in data and data["author_id"] is not None:
        data["author_id"] = data["author_id"].strip()
        if not data["author_id"]:
            raise HTTPException(status_code=400, detail="留言人的 ID 不能为空。")
    if "content" in data and data["content"] is not None:
        data["content"] = data["content"].strip()
        if not data["content"]:
            raise HTTPException(status_code=400, detail="留言内容不能为空。")
    if "like_count" in data and data["like_count"] is not None:
        data["like_count"] = max(0, data["like_count"])

    for field, value in data.items():
        setattr(comment, field, value)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/comments/{comment_id}")
def admin_delete_comment(comment_id: int, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    comment = db.get(PostComment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="留言不存在。")

    def collect_children(parent_id: int) -> list[PostComment]:
        children = db.scalars(select(PostComment).where(PostComment.parent_id == parent_id)).all()
        collected = []
        for child in children:
            collected.extend(collect_children(child.id))
            collected.append(child)
        return collected

    for child in collect_children(comment.id):
        db.delete(child)
    db.delete(comment)
    db.commit()
    return {"ok": True}


@router.get("/bonus", response_model=BonusContentOut)
def admin_get_bonus(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    bonus = db.get(BonusContent, 1)
    if not bonus:
        bonus = BonusContent(id=1, typewriter_message=DEFAULT_BONUS_MESSAGE)
        db.add(bonus)
        db.commit()
        db.refresh(bonus)
    return bonus


@router.put("/bonus", response_model=BonusContentOut)
def update_bonus(payload: BonusContentIn, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    bonus = db.get(BonusContent, 1)
    if not bonus:
        bonus = BonusContent(id=1, **payload.model_dump())
        db.add(bonus)
    else:
        for field, value in payload.model_dump().items():
            setattr(bonus, field, value)
    db.commit()
    db.refresh(bonus)
    return bonus


@router.get("/schedules", response_model=list[ScheduleItemOut])
def admin_list_schedules(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(ScheduleItem).order_by(ScheduleItem.sort_order.asc(), ScheduleItem.start_date.asc(), ScheduleItem.id.asc())
    return db.scalars(query).all()


@router.post("/schedules", response_model=ScheduleItemOut)
def create_schedule(payload: ScheduleItemIn, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = ScheduleItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/schedules/{schedule_id}", response_model=ScheduleItemOut)
def update_schedule(
    schedule_id: int,
    payload: ScheduleItemPatch,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ScheduleItem, schedule_id)
    if not item:
        raise HTTPException(status_code=404, detail="行程不存在。")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = db.get(ScheduleItem, schedule_id)
    if not item:
        raise HTTPException(status_code=404, detail="行程不存在。")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/socials", response_model=list[SocialLinkOut])
def admin_list_socials(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(SocialLink).order_by(SocialLink.sort_order.asc(), SocialLink.id.asc())
    return db.scalars(query).all()


@router.post("/socials", response_model=SocialLinkOut)
def create_social(payload: SocialLinkIn, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = SocialLink(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/socials/{social_id}", response_model=SocialLinkOut)
def update_social(
    social_id: int,
    payload: SocialLinkPatch,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    item = db.get(SocialLink, social_id)
    if not item:
        raise HTTPException(status_code=404, detail="联系方式不存在。")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/socials/{social_id}")
def delete_social(social_id: int, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = db.get(SocialLink, social_id)
    if not item:
        raise HTTPException(status_code=404, detail="联系方式不存在。")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/friends", response_model=list[FriendLinkOut])
def admin_list_friends(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(FriendLink).order_by(FriendLink.sort_order.asc(), FriendLink.id.asc())
    return db.scalars(query).all()


@router.get("/characters", response_model=list[CharacterProfileOut])
def admin_list_characters(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(CharacterProfile).order_by(CharacterProfile.sort_order.asc(), CharacterProfile.id.asc())
    return db.scalars(query).all()


@router.post("/characters", response_model=CharacterProfileOut)
def create_character(payload: CharacterProfileIn, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = CharacterProfile(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/characters/{character_id}", response_model=CharacterProfileOut)
def update_character(character_id: int, payload: CharacterProfilePatch, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = db.get(CharacterProfile, character_id)
    if not item:
        raise HTTPException(status_code=404, detail="登记簿记录不存在。")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/characters/{character_id}")
def delete_character(character_id: int, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = db.get(CharacterProfile, character_id)
    if not item:
        raise HTTPException(status_code=404, detail="登记簿记录不存在。")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/friends", response_model=FriendLinkOut)
def create_friend(payload: FriendLinkIn, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = FriendLink(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/friends/{friend_id}", response_model=FriendLinkOut)
def update_friend(
    friend_id: int,
    payload: FriendLinkPatch,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    item = db.get(FriendLink, friend_id)
    if not item:
        raise HTTPException(status_code=404, detail="友链不存在。")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/friends/{friend_id}")
def delete_friend(friend_id: int, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    item = db.get(FriendLink, friend_id)
    if not item:
        raise HTTPException(status_code=404, detail="友链不存在。")
    db.delete(item)
    db.commit()
    return {"ok": True}


DEFAULT_BONUS_MESSAGE = """致充满好奇心的你：

你能破解系统指令来到这个本不应该进入的这里，说明你拥有罕见的探索欲。

这里是凌巽的一片净土，没有喧嚣的社交，只有值得纪念的日子以及这段留言。

感谢你的到访。
愿你在人生的旅途中，也能寻找到自己的意义。

-- LINGXUN"""
