from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BonusContent, FriendLink, GalleryPhoto, Post, ScheduleItem, SocialLink
from ..schemas import BonusContentOut, FriendLinkOut, GalleryPhotoOut, PostOut, ScheduleItemOut, SocialLinkOut


router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/gallery", response_model=list[GalleryPhotoOut])
def list_gallery(db: Session = Depends(get_db)):
    query = (
        select(GalleryPhoto)
        .where(GalleryPhoto.is_visible.is_(True))
        .order_by(GalleryPhoto.sort_order.asc(), GalleryPhoto.id.desc())
    )
    return db.scalars(query).all()


@router.get("/posts", response_model=list[PostOut])
def list_posts(db: Session = Depends(get_db)):
    query = (
        select(Post)
        .where(Post.is_published.is_(True))
        .order_by(Post.date.desc(), Post.id.desc())
    )
    return db.scalars(query).all()


@router.get("/posts/{slug}", response_model=PostOut)
def get_post(slug: str, db: Session = Depends(get_db)):
    post = db.scalar(select(Post).where(Post.slug == slug, Post.is_published.is_(True)))
    if not post:
        raise HTTPException(status_code=404, detail="动态不存在或未发布。")
    return post


@router.get("/bonus", response_model=BonusContentOut)
def get_bonus(db: Session = Depends(get_db)):
    bonus = db.get(BonusContent, 1)
    if not bonus:
        raise HTTPException(status_code=404, detail="Bonus 内容尚未初始化。")
    return bonus


@router.get("/schedules", response_model=list[ScheduleItemOut])
def list_schedules(db: Session = Depends(get_db)):
    query = (
        select(ScheduleItem)
        .where(ScheduleItem.is_visible.is_(True))
        .order_by(ScheduleItem.sort_order.asc(), ScheduleItem.start_date.asc(), ScheduleItem.id.asc())
    )
    return db.scalars(query).all()


@router.get("/socials", response_model=list[SocialLinkOut])
def list_socials(db: Session = Depends(get_db)):
    query = (
        select(SocialLink)
        .where(SocialLink.is_visible.is_(True))
        .order_by(SocialLink.sort_order.asc(), SocialLink.id.asc())
    )
    return db.scalars(query).all()


@router.get("/friends", response_model=list[FriendLinkOut])
def list_friends(db: Session = Depends(get_db)):
    query = (
        select(FriendLink)
        .where(FriendLink.is_visible.is_(True))
        .order_by(FriendLink.sort_order.asc(), FriendLink.id.asc())
    )
    return db.scalars(query).all()
