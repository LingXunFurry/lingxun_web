from pathlib import Path
import re
import uuid
import tempfile

from fastapi import HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from .config import settings
from .media import IMAGE_LIMIT, save_image, save_staged_image, staging_directory, upload_path, inspect_image, compress_image, image_worker


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_ATTACHMENT_EXTENSIONS = {".pdf", ".txt", ".md", ".zip", ".rar", ".7z", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower()).strip("-")
    return slug[:120] or f"post-{uuid.uuid4().hex[:10]}"


def save_optimized_image_content(content: bytes, extension: str, folder: str, max_dimension: int, quality: int) -> str:
    return save_image(content, folder, max_dimension, quality)


async def save_image_upload(file: UploadFile, folder: str, max_dimension: int = 1280, quality: int = 76) -> str:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只支持 jpg、jpeg、png、webp、gif 图片。",
        )
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传文件必须是图片。")

    with tempfile.TemporaryDirectory(dir=staging_directory()) as temporary:
        staged = Path(temporary) / 'original'
        total = 0
        with staged.open('wb') as output:
            while chunk := await file.read(min(1024 * 1024, IMAGE_LIMIT + 1 - total)):
                total += len(chunk)
                if total > IMAGE_LIMIT:
                    raise HTTPException(400, '原图不能超过 50MB，上传后会自动压缩。')
                await run_in_threadpool(output.write, chunk)
        if not total:
            raise HTTPException(400, '请选择非空图片。')
        return await run_in_threadpool(save_staged_image, staged, folder, max_dimension, quality)


async def save_attachment_upload(file: UploadFile, folder: str = "post_attachments") -> str:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="附件只支持 PDF、Office、文本或压缩文件。")
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="附件不能超过 20MB。")
    target_dir = settings.upload_dir / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    (target_dir / filename).write_bytes(content)
    return f"/uploads/{folder}/{filename}"


def optimize_existing_upload_url(url: str | None, max_dimension: int = 1280, quality: int = 76) -> str | None:
    source = upload_path(url or '')
    if not source or not source.is_file():
        return None

    extension = source.suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return None

    if source.stat().st_size > IMAGE_LIMIT:
        raise HTTPException(400, '原图不能超过 50MB。')
    with image_worker:
        _, animated = inspect_image(source)
        if extension == '.gif' or animated:
            return None
        target = source.with_name(f'{source.stem}-{uuid.uuid4().hex[:8]}.webp')
        try:
            compress_image(source, target, max_dimension, quality)
            if target.stat().st_size >= source.stat().st_size and extension == '.webp':
                target.unlink(missing_ok=True)
                return None
            return f'/uploads/{target.relative_to(settings.upload_dir).as_posix()}'
        except Exception:
            target.unlink(missing_ok=True)
            raise
