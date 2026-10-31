"""Immutable image renditions; database URLs and source files remain valid."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from threading import BoundedSemaphore
import uuid
import warnings

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import settings

IMAGE_LIMIT = 50 * 1024 * 1024
PIXEL_LIMIT = 150_000_000
Image.MAX_IMAGE_PIXELS = PIXEL_LIMIT
image_worker = BoundedSemaphore(1)


def staging_directory() -> Path:
    directory = settings.upload_dir.parent / '.image-staging'
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    return directory


def inspect_image(path: Path) -> tuple[str, bool]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', Image.DecompressionBombWarning)
            # Header inspection only; decoding runs in the isolated libvips worker.
            with Image.open(path) as image:
                extension = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp', 'GIF': '.gif'}.get(image.format)
                if not extension:
                    raise HTTPException(400, '只支持 JPG、PNG、WebP 和 GIF 图片。')
                if image.width * image.height > PIXEL_LIMIT:
                    raise HTTPException(400, '图片超过 1.5 亿像素安全上限，请先缩小分辨率。正常大图会自动压缩。')
                if max(image.size) > 30_000:
                    raise HTTPException(400, '图片单边超过 30000 像素，请先缩短超长边；普通高像素图片会自动压缩。')
                animated = getattr(image, 'is_animated', False)
                if animated and (path.stat().st_size > 5 * 1024 * 1024 or image.width * image.height > 36_000_000):
                    raise HTTPException(400, '动态图请控制在 5MB、3600 万像素以内；静态图片可自动压缩。')
                return extension, animated
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(400, '无法读取图片，文件可能损坏或格式不受支持，请重新导出后上传。') from exc
    except Image.DecompressionBombError as exc:
        raise HTTPException(400, '图片分辨率超过安全上限，请先缩小分辨率。') from exc


def compress_image(source: Path, target: Path, dimension: int, quality: int) -> None:
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'app.image_worker', str(source), str(target), str(dimension), str(quality)],
            cwd=Path(__file__).resolve().parents[1],
            env={**os.environ, 'VIPS_CONCURRENCY': '1'},
            capture_output=True, timeout=90,
        )
        if result.returncode:
            if b'No module named' in result.stderr:
                raise HTTPException(503, '图片压缩服务尚未就绪，请联系管理员检查图片处理依赖。')
            raise HTTPException(400, '图片解码失败，文件可能损坏或格式不受支持，请重新导出后上传。')
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(503, '图片处理超时，请稍后重试或缩小图片后上传。') from exc
    except OSError as exc:
        raise HTTPException(503, '图片处理服务暂时不可用，请稍后重试。') from exc


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
            warnings.simplefilter('ignore', Image.DecompressionBombWarning)
            _, animated = inspect_image(path)
            with Image.open(path) as source:
                source.verify()
            with Image.open(path) as source:
                if animated:
                    data = {'version': 1, 'src': _url(path), 'animated': True, 'source_bytes': path.stat().st_size, 'bytes': path.stat().st_size, 'variants': []}
                    path.with_suffix(path.suffix + '.media.json').write_text(json.dumps(data), encoding='utf-8')
                    return data
                original_size = source.size
                if max(original_size) <= 1920:
                    image = ImageOps.exif_transpose(source).copy()
            if max(original_size) > 1920:
                with tempfile.TemporaryDirectory(dir=staging_directory()) as temporary:
                    normalized = Path(temporary) / 'normalized.webp'
                    compress_image(path, normalized, 1920, 80)
                    with Image.open(normalized) as small:
                        image = small.copy()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(400, '无法读取图片，文件可能损坏或格式不受支持。') from exc

    variants = []
    identifier = uuid.uuid4().hex
    generated = []
    manifest = path.with_suffix(path.suffix + '.media.json')
    try:
        for dimension in sorted({min(480, max(image.size)), min(960, max(image.size)), max(image.size)}):
            rendition = image.copy()
            rendition.thumbnail((dimension, dimension), Image.Resampling.LANCZOS, reducing_gap=2.0)
            target = path.with_name(f'{identifier}-{dimension}.webp')
            generated.append(target)
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
        manifest.write_text(json.dumps(data), encoding='utf-8')
        return data
    except OSError as exc:
        for file in generated:
            file.unlink(missing_ok=True)
        manifest.unlink(missing_ok=True)
        raise HTTPException(503, '浏览图片保存失败，请检查服务器可用空间后重试。原图未被修改。') from exc


def optimize_uploaded_url(url: str) -> dict:
    path = upload_path(url)
    if not path or not path.is_file() or path.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp', '.gif'}:
        raise HTTPException(400, '只能优化本站已上传的图片，不会读取或下载外部地址。')
    if path.stat().st_size > IMAGE_LIMIT:
        raise HTTPException(400, '原图不能超过 50MB，上传后会自动压缩。')
    with image_worker:
        return create_renditions(path)


def save_image(content: bytes, folder: str, max_dimension: int, quality: int) -> str:
    if not content or len(content) > IMAGE_LIMIT:
        raise HTTPException(400, '图片为空或超过 50MB，正常大图上传后会自动压缩。')
    with tempfile.TemporaryDirectory(dir=staging_directory()) as temporary:
        staged = Path(temporary) / 'original'
        staged.write_bytes(content)
        return save_staged_image(staged, folder, max_dimension, quality)


def save_staged_image(staged: Path, folder: str, max_dimension: int, quality: int) -> str:
    with image_worker:
        extension, animated = inspect_image(staged)
        directory = (settings.upload_dir / folder).resolve()
        directory.mkdir(parents=True, exist_ok=True)
        identifier = uuid.uuid4().hex
        target = directory / f'{identifier}{extension if animated else ".webp"}'
        original = directory / 'originals' / f'{identifier}{extension}'
        try:
            with tempfile.TemporaryDirectory(dir=staging_directory()) as temporary:
                processed = Path(temporary) / target.name
                if animated:
                    shutil.copyfile(staged, processed)
                else:
                    compress_image(staged, processed, max_dimension, quality)
                original.parent.mkdir(exist_ok=True)
                shutil.copyfile(staged, original)
                processed.replace(target)
                create_renditions(target, _url(original), staged.stat().st_size)
            return _url(target)
        except Exception:
            target.unlink(missing_ok=True)
            original.unlink(missing_ok=True)
            target.with_suffix(target.suffix + '.media.json').unlink(missing_ok=True)
            raise
