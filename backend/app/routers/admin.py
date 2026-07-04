from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import authenticate_admin, create_access_token, require_admin
from ..database import get_db
from ..models import BonusContent, FriendLink, GalleryPhoto, Post, ScheduleItem, SocialLink
from ..schemas import (
    BonusContentIn,
    BonusContentOut,
    FriendLinkIn,
    FriendLinkOut,
    FriendLinkPatch,
    GalleryPhotoOut,
    GalleryPhotoUpdate,
    LoginRequest,
    PostIn,
    PostOut,
    PostPatch,
    ScheduleItemIn,
    ScheduleItemOut,
    ScheduleItemPatch,
    SocialLinkIn,
    SocialLinkOut,
    SocialLinkPatch,
    TokenResponse,
)
from ..utils import save_image_upload, slugify


router = APIRouter(prefix="/api/admin", tags=["admin"])


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


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    if not authenticate_admin(payload.username, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码不正确。")
    return TokenResponse(access_token=create_access_token(payload.username))


@router.get("/me")
def me(admin: str = Depends(require_admin)):
    return {"username": admin}


@router.get("/gallery", response_model=list[GalleryPhotoOut])
def admin_list_gallery(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(GalleryPhoto).order_by(GalleryPhoto.sort_order.asc(), GalleryPhoto.id.desc())
    return db.scalars(query).all()


@router.post("/gallery", response_model=GalleryPhotoOut)
async def create_gallery_photo(
    title: str = Form(""),
    description: str = Form(""),
    sort_order: int = Form(0),
    is_visible: bool = Form(True),
    file: UploadFile = File(...),
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    file_url = await save_image_upload(file, "gallery")
    photo = GalleryPhoto(
        title=title,
        description=description,
        sort_order=sort_order,
        is_visible=is_visible,
        file_url=file_url,
        original_filename=file.filename or "",
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo


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


@router.get("/posts", response_model=list[PostOut])
def admin_list_posts(_: str = Depends(require_admin), db: Session = Depends(get_db)):
    query = select(Post).order_by(Post.date.desc(), Post.id.desc())
    return db.scalars(query).all()


@router.post("/posts", response_model=PostOut)
def create_post(payload: PostIn, _: str = Depends(require_admin), db: Session = Depends(get_db)):
    slug_source = payload.slug or payload.title
    post = Post(
        slug=unique_slug(db, slug_source),
        title=payload.title,
        date=payload.date,
        tag=payload.tag,
        desc=payload.desc,
        content=payload.content,
        cover_url=payload.cover_url,
        is_published=payload.is_published,
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
    if "slug" in data and data["slug"]:
        data["slug"] = unique_slug(db, data["slug"], current_id=post.id)
    elif "title" in data and post.slug.startswith("post-"):
        data["slug"] = unique_slug(db, data["title"], current_id=post.id)
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
    return {"file_url": await save_image_upload(file, "post_covers")}


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
