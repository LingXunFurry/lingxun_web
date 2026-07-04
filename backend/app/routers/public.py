import random

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile as StarletteUploadFile

from ..database import get_db
from ..models import BonusContent, FriendLink, GalleryPhoto, Post, PostComment, ScheduleItem, SiteStats, SocialLink
from ..schemas import (
    BonusContentOut,
    FriendLinkOut,
    GalleryPhotoOut,
    PostCommentOut,
    PostOut,
    ScheduleItemOut,
    SiteStatsOut,
    SocialLinkOut,
)
from ..utils import save_image_upload


router = APIRouter(prefix="/api/public", tags=["public"])
DEFAULT_AVATAR_COUNT = 8


def default_avatar_url() -> str:
    return f"/api/public/default-avatar/{random.randint(1, DEFAULT_AVATAR_COUNT)}.svg"


def get_or_create_stats(db: Session) -> SiteStats:
    stats = db.get(SiteStats, 1)
    if stats:
        return stats
    stats = SiteStats(id=1, visit_count=0, interaction_count=0)
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats


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


@router.get("/posts/{slug}/comments", response_model=list[PostCommentOut])
def list_post_comments(slug: str, db: Session = Depends(get_db)):
    post = db.scalar(select(Post).where(Post.slug == slug, Post.is_published.is_(True)))
    if not post:
        raise HTTPException(status_code=404, detail="动态不存在或未发布。")
    query = (
        select(PostComment)
        .where(PostComment.post_id == post.id, PostComment.is_visible.is_(True))
        .order_by(PostComment.created_at.asc(), PostComment.id.asc())
    )
    return db.scalars(query).all()


@router.post("/posts/{slug}/comments", response_model=PostCommentOut, status_code=status.HTTP_201_CREATED)
async def create_post_comment(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
):
    post = db.scalar(select(Post).where(Post.slug == slug, Post.is_published.is_(True)))
    if not post:
        raise HTTPException(status_code=404, detail="动态不存在或未发布。")

    form = await request.form()
    author_id = str(form.get("author_id") or "")
    content = str(form.get("content") or "")
    parent_value = str(form.get("parent_id") or "").strip()
    parent_id: int | None = None
    if parent_value:
        try:
            parent_id = int(parent_value)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="回复 ID 不正确。") from exc

    author_id = author_id.strip()
    content = content.strip()
    if not author_id:
        raise HTTPException(status_code=400, detail="留言人的 ID 不能为空。")
    if not content:
        raise HTTPException(status_code=400, detail="留言内容不能为空。")
    if len(author_id) > 80:
        raise HTTPException(status_code=400, detail="留言人的 ID 不能超过 80 个字符。")
    if len(content) > 1000:
        raise HTTPException(status_code=400, detail="留言内容不能超过 1000 个字符。")

    if parent_id is not None:
        parent = db.get(PostComment, parent_id)
        if not parent or parent.post_id != post.id or not parent.is_visible:
            raise HTTPException(status_code=404, detail="要回复的留言不存在。")

    avatar = form.get("avatar")
    avatar_url = default_avatar_url()
    if isinstance(avatar, StarletteUploadFile) and avatar.filename:
        avatar_url = await save_image_upload(avatar, "comment_avatars", max_dimension=512, quality=78)

    comment = PostComment(
        post_id=post.id,
        parent_id=parent_id,
        author_id=author_id,
        avatar_url=avatar_url,
        content=content,
        like_count=0,
        is_visible=True,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.post("/posts/{slug}/comments/{comment_id}/like", response_model=PostCommentOut)
def like_post_comment(slug: str, comment_id: int, db: Session = Depends(get_db)):
    post = db.scalar(select(Post).where(Post.slug == slug, Post.is_published.is_(True)))
    if not post:
        raise HTTPException(status_code=404, detail="动态不存在或未发布。")
    comment = db.get(PostComment, comment_id)
    if not comment or comment.post_id != post.id or not comment.is_visible:
        raise HTTPException(status_code=404, detail="留言不存在。")
    comment.like_count += 1
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/default-avatar/{avatar_id}.svg")
def get_default_avatar(avatar_id: int):
    palette = [
        ("#67e8f9", "#0f172a"),
        ("#fbbf24", "#1f2937"),
        ("#f472b6", "#111827"),
        ("#a78bfa", "#0b1120"),
        ("#34d399", "#052e2b"),
        ("#fb7185", "#25111a"),
        ("#60a5fa", "#0c1d34"),
        ("#f97316", "#27140a"),
    ]
    index = (avatar_id - 1) % len(palette)
    primary, background = palette[index]
    label = chr(65 + index)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<rect width="128" height="128" rx="28" fill="{background}"/>
<circle cx="64" cy="48" r="25" fill="{primary}" opacity="0.9"/>
<path d="M24 112c7-27 25-42 40-42s33 15 40 42" fill="{primary}" opacity="0.7"/>
<text x="64" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#fff">{label}</text>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/bonus", response_model=BonusContentOut)
def get_bonus(db: Session = Depends(get_db)):
    bonus = db.get(BonusContent, 1)
    if not bonus:
        raise HTTPException(status_code=404, detail="Bonus 内容尚未初始化。")
    return bonus


@router.get("/stats", response_model=SiteStatsOut)
def get_stats(db: Session = Depends(get_db)):
    return get_or_create_stats(db)


@router.post("/stats/visit", response_model=SiteStatsOut)
def record_visit(db: Session = Depends(get_db)):
    stats = get_or_create_stats(db)
    stats.visit_count += 1
    db.commit()
    db.refresh(stats)
    return stats


@router.post("/stats/interaction", response_model=SiteStatsOut)
def record_interaction(db: Session = Depends(get_db)):
    stats = get_or_create_stats(db)
    stats.interaction_count += 1
    db.commit()
    db.refresh(stats)
    return stats


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
