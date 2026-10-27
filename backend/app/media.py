"""Immutable image renditions; database URLs and source files remain valid."""

from io import BytesIO
import json
from pathlib import Path
from threading import BoundedSemaphore
import uuid
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import settings

IMAGE_LIMIT = 20 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 36_000_000
image_worker = BoundedSemaphore(1)


def upload_path(url: str) -> Path | None:
    if not url.startswith('/uploads/') or '?' in url or '#' in url:
        return None
    root = settings.upload_dir.resolve()
    path = (root / url.removeprefix('/uploads/')).resolve()
    return path if root in path.parents else None


def image_info(url: str | None) -> dict | None:
    path = upload_path(url or '')
    if not path or not path.is_file():
        return None
    manifest = path.with_suffix(path.suffix + '.media.json')
    try:
        data = json.loads(manifest.read_text(encoding='utf-8'))
        if data.get('source_bytes') == path.stat().st_size and data.get('version') == 1:
            return data
    except (OSError, ValueError):
        pass
    return None


def _url(path: Path) -> str:
    return '/uploads/' + path.relative_to(settings.upload_dir.resolve()).as_posix()


def create_renditions(path: Path, original_url: str | None = None, original_bytes: int | None = None) -> dict:
    existing = image_info(_url(path))
    if existing:
        return existing
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(path) as source:
                source.verify()
            with Image.open(path) as source:
                if getattr(source, 'is_animated', False):
                    data = {'version': 1, 'src': _url(path), 'animated': True, 'source_bytes': path.stat().st_size, 'bytes': path.stat().st_size, 'variants': []}
                    path.with_suffix(path.suffix + '.media.json').write_text(json.dumps(data), encoding='utf-8')
                    return data
                image = ImageOps.exif_transpose(source)
                original_size = image.size
                image.thumbnail((1920, 1920), Image.Resampling.LANCZOS, reducing_gap=2.0)
                image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(400, '图片损坏、格式不受支持或像素过大（最多 3600 万像素）。') from exc

    variants = []
    identifier = uuid.uuid4().hex
    for dimension in sorted({min(480, max(image.size)), min(960, max(image.size)), max(image.size)}):
        rendition = image.copy()
        rendition.thumbnail((dimension, dimension), Image.Resampling.LANCZOS, reducing_gap=2.0)
        target = path.with_name(f'{identifier}-{dimension}.webp')
        rendition.save(target, 'WEBP', quality=78, method=4)
        if rendition.size == original_size and target.stat().st_size >= path.stat().st_size:
            target.unlink()
            target = path
        variants.append({'src': _url(target), 'width': rendition.width, 'height': rendition.height, 'bytes': target.stat().st_size})
    largest = variants[-1]
    data = {
        'version': 1, 'src': largest['src'], 'width': image.width, 'height': image.height,
        'bytes': largest['bytes'], 'source_bytes': path.stat().st_size,
        'original_url': original_url or _url(path), 'original_bytes': original_bytes or path.stat().st_size,
        'variants': variants,
    }
    path.with_suffix(path.suffix + '.media.json').write_text(json.dumps(data), encoding='utf-8')
    return data


def optimize_uploaded_url(url: str) -> dict:
    path = upload_path(url)
    if not path or not path.is_file() or path.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp', '.gif'}:
        raise HTTPException(400, '只能优化本站已上传的图片，不会读取或下载外部地址。')
    if path.stat().st_size > IMAGE_LIMIT:
        raise HTTPException(400, '图片不能超过 20MB。')
    with image_worker:
        return create_renditions(path)


def save_image(content: bytes, folder: str, max_dimension: int, quality: int) -> str:
    if not content or len(content) > IMAGE_LIMIT:
        raise HTTPException(400, '图片为空或超过 20MB。')
    with image_worker:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(BytesIO(content)) as source:
                    source.verify()
                with Image.open(BytesIO(content)) as source:
                    extension = Image.registered_extensions()
                    source_extension = next((ext for ext in ('.jpg', '.png', '.webp', '.gif') if extension.get(ext) == source.format), None)
                    if not source_extension:
                        raise HTTPException(400, '只支持 JPG、PNG、WebP 和 GIF 图片。')
                    animated = getattr(source, 'is_animated', False)
                    if animated and len(content) > 5 * 1024 * 1024:
                        raise HTTPException(400, '动态图不能超过 5MB。')
                    directory = (settings.upload_dir / folder).resolve()
                    directory.mkdir(parents=True, exist_ok=True)
                    identifier = uuid.uuid4().hex
                    original_dir = directory / 'originals'
                    original_dir.mkdir(exist_ok=True)
                    original = original_dir / f'{identifier}{source_extension}'
                    if animated:
                        target = directory / f'{identifier}{source_extension}'
                        target.write_bytes(content)
                        return _url(target)
                    image = ImageOps.exif_transpose(source)
                    image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS, reducing_gap=2.0)
                    image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
                    target = directory / f'{identifier}.webp'
                    image.save(target, 'WEBP', quality=quality, method=4)
                    original.write_bytes(content)
                    create_renditions(target, _url(original), len(content))
                    return _url(target)
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise HTTPException(400, '图片损坏或像素过大（最多 3600 万像素）。') from exc
