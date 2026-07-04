from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class GalleryPhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str = ""
    description: str = ""
    file_url: str
    original_filename: str = ""
    sort_order: int = 0
    is_visible: bool = True


class GalleryPhotoUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class PostIn(BaseModel):
    slug: str | None = None
    title: str = Field(..., min_length=1)
    date: str = Field(..., min_length=1)
    tag: str = "UPDATE"
    desc: str = ""
    content: str = ""
    cover_url: str | None = None
    is_published: bool = True


class PostPatch(BaseModel):
    slug: str | None = None
    title: str | None = None
    date: str | None = None
    tag: str | None = None
    desc: str | None = None
    content: str | None = None
    cover_url: str | None = None
    is_published: bool | None = None


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    title: str
    date: str
    tag: str
    desc: str
    content: str = ""
    cover_url: str | None = None
    is_published: bool


class PostCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    post_id: int
    parent_id: int | None = None
    author_id: str
    avatar_url: str = ""
    content: str
    like_count: int = 0
    is_visible: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PostCommentPatch(BaseModel):
    author_id: str | None = None
    avatar_url: str | None = None
    content: str | None = None
    like_count: int | None = None
    is_visible: bool | None = None


class BonusContentIn(BaseModel):
    typewriter_message: str = Field(..., min_length=1)
    birthday_date: str = "2005-12-13"
    love_date: str = "2026-06-01"
    site_date: str = "2026-06-04"
    future_date: str = "2026-12-31"


class BonusContentOut(BonusContentIn):
    model_config = ConfigDict(from_attributes=True)

    id: int = 1


class SiteStatsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    visit_count: int = 0
    interaction_count: int = 0


class ScheduleItemIn(BaseModel):
    code: str = ""
    name: str = Field(..., min_length=1)
    location: str = ""
    start_date: str = Field(..., min_length=1)
    end_date: str = Field(..., min_length=1)
    description: str = ""
    sort_order: int = 0
    is_visible: bool = True


class ScheduleItemPatch(BaseModel):
    code: str | None = None
    name: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class ScheduleItemOut(ScheduleItemIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class SocialLinkIn(BaseModel):
    name: str = Field(..., min_length=1)
    icon: str = ""
    desc: str = ""
    link: str = ""
    number: str = ""
    sort_order: int = 0
    is_visible: bool = True


class SocialLinkPatch(BaseModel):
    name: str | None = None
    icon: str | None = None
    desc: str | None = None
    link: str | None = None
    number: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class SocialLinkOut(SocialLinkIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class FriendLinkIn(BaseModel):
    display_id: str = Field(..., min_length=1)
    avatar_url: str = ""
    url: str = ""
    comment: str = ""
    sort_order: int = 0
    is_visible: bool = True


class FriendLinkPatch(BaseModel):
    display_id: str | None = None
    avatar_url: str | None = None
    url: str | None = None
    comment: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class FriendLinkOut(FriendLinkIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
