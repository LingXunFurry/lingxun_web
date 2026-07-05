from pathlib import Path
from io import BytesIO
import re
import uuid

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import settings


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
Image.MAX_IMAGE_PIXELS = 36_000_000


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower()).strip("-")
    return slug[:120] or f"post-{uuid.uuid4().hex[:10]}"


def _open_verified_image(content: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(content))
        image.verify()
        image = Image.open(BytesIO(content))
        return ImageOps.exif_transpose(image)
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无法识别图片文件。") from exc


def _prepare_webp(image: Image.Image, max_dimension: int) -> Image.Image:
    image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS, reducing_gap=2.0)
    if image.mode not in ("RGB", "RGBA", "L"):
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    return image


def save_optimized_image_content(content: bytes, extension: str, folder: str, max_dimension: int, quality: int) -> str:
    target_dir = settings.upload_dir / folder
    target_dir.mkdir(parents=True, exist_ok=True)

    image = _open_verified_image(content)
    if extension == ".gif" or getattr(image, "is_animated", False):
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="动态图不能超过 5MB，建议上传静态图片。")
        filename = f"{uuid.uuid4().hex}{extension}"
        target = target_dir / filename
        target.write_bytes(content)
        return f"/uploads/{folder}/{filename}"

    image = _prepare_webp(image, max_dimension)
    filename = f"{uuid.uuid4().hex}.webp"
    target = target_dir / filename
    image.save(target, "WEBP", quality=quality, method=6)
    return f"/uploads/{folder}/{filename}"


async def save_image_upload(file: UploadFile, folder: str, max_dimension: int = 1280, quality: int = 76) -> str:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只支持 jpg、jpeg、png、webp、gif 图片。",
        )
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传文件必须是图片。")

    target_dir = settings.upload_dir / folder
    target_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片不能超过 20MB。")

    return save_optimized_image_content(content, extension, folder, max_dimension, quality)


def optimize_existing_upload_url(url: str | None, max_dimension: int = 1280, quality: int = 76) -> str | None:
    if not url or not url.startswith("/uploads/"):
        return None

    relative_path = url.removeprefix("/uploads/").lstrip("/")
    source = settings.upload_dir / relative_path
    if not source.exists() or not source.is_file():
        return None

    extension = source.suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return None

    content = source.read_bytes()
    image = _open_verified_image(content)
    if extension == ".gif" or getattr(image, "is_animated", False):
        return None

    image = _prepare_webp(image, max_dimension)
    target = source.with_name(f"{source.stem}-{uuid.uuid4().hex[:8]}.webp")
    image.save(target, "WEBP", quality=quality, method=6)

    if target.stat().st_size >= source.stat().st_size and extension == ".webp":
        target.unlink(missing_ok=True)
        return None

    return f"/uploads/{target.relative_to(settings.upload_dir).as_posix()}"
