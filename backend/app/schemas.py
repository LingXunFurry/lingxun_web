from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from .media import image_info


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 1800


class PasswordChangeRequest(BaseModel):
    username: str = Field(..., min_length=1)
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)


class GalleryPhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str = ""
    description: str = ""
    category: str = ""
    date: str = ""
    location: str = ""
    file_url: str
    original_filename: str = ""
    sort_order: int = 0
    is_visible: bool = True
    character_ids: list[int] | None = None
    is_home_hero: bool = False
    hero_order: int = 0
    is_home_portrait: bool = False
    is_home_gallery: bool = False
    home_order: int = 0

    @computed_field
    @property
    def image(self) -> dict | None:
        return image_info(self.file_url)


class HomepageMediaIn(BaseModel):
    hero_ids: list[int] = Field(default_factory=list, max_length=12)
    portrait_id: int | None = None
    gallery_ids: list[int] = Field(default_factory=list, max_length=3)


class OptimizeImageIn(BaseModel):
    url: str = Field(..., max_length=500)


class GalleryPhotoUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    date: str | None = None
    location: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None
    character_ids: list[int] | None = None
    is_home_hero: bool | None = None
    hero_order: int | None = None
    is_home_portrait: bool | None = None
    is_home_gallery: bool | None = None
    home_order: int | None = None


class PostIn(BaseModel):
    slug: str | None = None
    title: str = Field(..., min_length=1)
    date: str = Field(..., min_length=1)
    tag: str = "UPDATE"
    desc: str = ""
    content: str = ""
    cover_url: str | None = None
    image_urls: list[str] = Field(default_factory=list)
    attachments: list[str] = Field(default_factory=list)
    links: list[dict[str, str]] = Field(default_factory=list)
    is_published: bool = True
    is_pinned: bool = False
    pin_order: int = 0
    is_character_story: bool = False
    story_order: int = 0
    story_summary: str = ""
    story_character_id: int | None = None
    story_cover_url: str | None = Field(default=None, max_length=500)


class PostPatch(BaseModel):
    slug: str | None = None
    title: str | None = None
    date: str | None = None
    tag: str | None = None
    desc: str | None = None
    content: str | None = None
    cover_url: str | None = None
    image_urls: list[str] | None = None
    attachments: list[str] | None = None
    links: list[dict[str, str]] | None = None
    is_published: bool | None = None
    is_pinned: bool | None = None
    pin_order: int | None = None
    is_character_story: bool | None = None
    story_order: int | None = None
    story_summary: str | None = None
    story_character_id: int | None = None
    story_cover_url: str | None = Field(default=None, max_length=500)


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
    image_urls: list[str] | None = None
    attachments: list[str] | None = None
    links: list[dict[str, str]] | None = None
    is_published: bool
    is_pinned: bool = False
    pin_order: int = 0
    is_character_story: bool = False
    story_order: int = 0
    story_summary: str = ""
    story_character_id: int | None = None
    story_cover_url: str | None = None

    @computed_field
    @property
    def cover_image(self) -> dict | None:
        return image_info(self.cover_url)

    @computed_field
    @property
    def story_image(self) -> dict | None:
        return image_info(self.story_cover_url if self.story_cover_url is not None else self.cover_url)

    @computed_field
    @property
    def image_assets(self) -> dict:
        return {url: image_info(url) for url in self.image_urls or []}


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
    typewriter_message: str
    birthday_title: str = "BIRTHDAY"
    birthday_subtitle: str = "诞生之日"
    birthday_date: str = "2005-12-13"
    love_title: str = "FALL_IN_LOVE"
    love_subtitle: str = "和小狼恋爱"
    love_date: str = "2026-06-01"
    site_title: str = "WEBSITE_BIRTH"
    site_subtitle: str = "网站上线"
    site_date: str = "2026-06-04"
    future_title: str = "FUTURE_X"
    future_subtitle: str = "观测未定"
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
    icon: str = Field(default="", max_length=500)
    desc: str = ""
    link: str = ""
    number: str = ""
    sort_order: int = 0
    is_visible: bool = True


class SocialLinkPatch(BaseModel):
    name: str | None = None
    icon: str | None = Field(default=None, max_length=500)
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


class CharacterProfileIn(BaseModel):
    name: str = Field(..., min_length=1)
    alias: str = ""
    species: str = "龙族"
    role: str = "冒险者"
    region: str = "人类城镇"
    work: str = "冒险者公会委托"
    places: str = "公会 / 酒馆 / 家中"
    status: str = "可接受委托"
    introduction: str = ""
    details: str = ""
    custom_fields: list[dict[str, str]] | None = None
    image_url: str = ""
    sort_order: int = 0
    is_visible: bool = True


class CharacterProfilePatch(BaseModel):
    name: str | None = None
    alias: str | None = None
    species: str | None = None
    role: str | None = None
    region: str | None = None
    work: str | None = None
    places: str | None = None
    status: str | None = None
    introduction: str | None = None
    details: str | None = None
    custom_fields: list[dict[str, str]] | None = None
    image_url: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class CharacterProfileOut(CharacterProfileIn):
    model_config = ConfigDict(from_attributes=True)

    id: int

    @computed_field
    @property
    def image(self) -> dict | None:
        return image_info(self.image_url)


class SiteContentPatch(BaseModel):
    value: str


class SiteContentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    group_name: str
    label: str
    value: str
    content_type: str
    sort_order: int
