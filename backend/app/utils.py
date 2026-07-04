from pathlib import Path
from io import BytesIO
import re
import uuid

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError

from .config import settings


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower()).strip("-")
    return slug[:120] or f"post-{uuid.uuid4().hex[:10]}"


async def save_image_upload(file: UploadFile, folder: str, max_dimension: int = 1920, quality: int = 82) -> str:
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

    try:
        image = Image.open(BytesIO(content))
        image.verify()
        image = Image.open(BytesIO(content))
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无法识别图片文件。") from exc

    if extension == ".gif" or getattr(image, "is_animated", False):
        filename = f"{uuid.uuid4().hex}{extension}"
        target = target_dir / filename
        target.write_bytes(content)
        return f"/uploads/{folder}/{filename}"

    image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    filename = f"{uuid.uuid4().hex}.webp"
    target = target_dir / filename
    image.save(target, "WEBP", quality=quality, method=6)
    return f"/uploads/{folder}/{filename}"
