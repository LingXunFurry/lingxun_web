import asyncio
from concurrent.futures import ThreadPoolExecutor
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings
from app.main import create_app
from app.media import image_info, optimize_uploaded_url, save_image, upload_path
from app.utils import save_image_upload, optimize_existing_upload_url


class LargeMediaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patcher = patch.object(settings, 'upload_dir', self.root / 'uploads')
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.temp.cleanup()

    def png(self, size=(8000, 6000)):
        output = io.BytesIO()
        Image.new('1', size).save(output, 'PNG')
        return output.getvalue()

    def assert_clean_staging(self):
        self.assertEqual(list((self.root / '.image-staging').iterdir()), [])

    def test_48mp_upload_stages_before_compression_and_preserves_original(self):
        content = self.png()
        from app.media import compress_image
        def check_staged(source, *args):
            self.assertTrue(source.is_file())
            self.assertNotIn(settings.upload_dir, source.parents)
            return compress_image(source, *args)
        with patch('app.media.compress_image', side_effect=check_staged):
            url = asyncio.run(save_image_upload(UploadFile(filename='48mp.png', file=io.BytesIO(content)), 'gallery', 1920, 80))
        info = image_info(url)
        self.assertLessEqual(max(info['width'], info['height']), 1920)
        self.assertEqual(upload_path(info['original_url']).read_bytes(), content)
        self.assertEqual([v['width'] for v in info['variants']], [480, 960, 1920])
        self.assert_clean_staging()

    def test_existing_48mp_file_gets_variants_without_modification(self):
        settings.upload_dir.mkdir()
        path = settings.upload_dir / 'original.png'
        content = self.png()
        path.write_bytes(content)
        info = optimize_uploaded_url('/uploads/original.png')
        self.assertLessEqual(info['width'], 1920)
        self.assertEqual(path.read_bytes(), content)
        self.assert_clean_staging()

    def test_invalid_and_over_safety_limit_do_not_leave_files(self):
        for content in (b'broken', self.png((16000, 10000)), self.png((30001, 1))):
            with self.assertRaises(HTTPException) as failure:
                save_image(content, 'gallery', 1920, 80)
            self.assertEqual(failure.exception.status_code, 400)
            self.assert_clean_staging()
        self.assertFalse(settings.upload_dir.exists())

    def test_worker_failure_cleans_all_public_and_staged_files(self):
        with patch('app.media.compress_image', side_effect=HTTPException(503, 'unavailable')):
            with self.assertRaises(HTTPException):
                save_image(self.png(), 'gallery', 1920, 80)
        self.assertEqual([p for p in settings.upload_dir.rglob('*') if p.is_file()], [])
        self.assert_clean_staging()

    def test_legacy_optimizer_also_handles_48mp_and_keeps_source(self):
        settings.upload_dir.mkdir()
        source = settings.upload_dir / 'old.png'
        content = self.png()
        source.write_bytes(content)
        new_url = optimize_existing_upload_url('/uploads/old.png')
        self.assertIsNotNone(new_url)
        self.assertEqual(source.read_bytes(), content)
        with Image.open(upload_path(new_url)) as image:
            self.assertLessEqual(max(image.size), 1280)
        self.assertIsNone(optimize_existing_upload_url('/uploads/../secret.png'))

    def test_transparent_large_image_and_exif_orientation(self):
        output = io.BytesIO()
        Image.new('RGBA', (8000, 6000), (60, 90, 120, 128)).save(output, 'PNG')
        url = save_image(output.getvalue(), 'gallery', 1920, 80)
        with Image.open(upload_path(url)) as image:
            self.assertEqual(image.mode, 'RGBA')
            self.assertEqual(image.getpixel((0, 0))[3], 128)
        output = io.BytesIO()
        exif = Image.Exif()
        exif[274] = 6
        Image.new('RGB', (1200, 800)).save(output, 'JPEG', exif=exif)
        url = save_image(output.getvalue(), 'gallery', 1920, 80)
        with Image.open(upload_path(url)) as image:
            self.assertEqual(image.size, (800, 1200))

    def test_parallel_uploads_are_complete_and_distinct(self):
        content = self.png((1200, 900))
        with ThreadPoolExecutor(max_workers=2) as pool:
            urls = list(pool.map(lambda _: save_image(content, 'gallery', 1920, 80), range(2)))
        self.assertEqual(len(set(urls)), 2)
        self.assertTrue(all(image_info(url) for url in urls))
        self.assert_clean_staging()

    def test_variant_write_failure_cleans_partial_files(self):
        content = self.png()
        with patch.object(Image.Image, 'save', side_effect=OSError('disk full')):
            with self.assertRaises(HTTPException) as error:
                save_image(content, 'gallery', 1920, 80)
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual([p for p in settings.upload_dir.rglob('*') if p.is_file()], [])


class ErrorPageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for code in (403, 404, 500, 503):
            (self.root / f'{code}.html').write_text(f'<!doctype html><h1>{code} tavern</h1>')
        self.patcher = patch.object(settings, 'dist_dir', self.root)
        self.patcher.start()
        app = create_app()
        # Insert before the site's final catch-all.
        catchall = app.router.routes.pop()
        @app.get('/test-error/{code}')
        def failure(code: int):
            raise HTTPException(code, 'original detail', headers={'Retry-After': '60'})
        @app.get('/test-crash')
        def crash():
            raise RuntimeError('PRIVATE ERROR')
        app.router.routes.append(catchall)
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        self.patcher.stop()
        self.temp.cleanup()

    def test_unknown_browser_url_is_html_404(self):
        response = self.client.get('/aa', headers={'Accept': 'text/html'})
        self.assertEqual(response.status_code, 404)
        self.assertIn('text/html', response.headers['content-type'])
        self.assertIn('404 tavern', response.text)
        self.assertIn('no-store', response.headers['cache-control'])

    def test_http_errors_preserve_status_and_headers(self):
        for code in (403, 404, 500, 503):
            response = self.client.get(f'/test-error/{code}', headers={'Accept': 'text/html'})
            self.assertEqual(response.status_code, code)
            self.assertIn(f'{code} tavern', response.text)
            self.assertEqual(response.headers['retry-after'], '60')

    def test_api_and_missing_assets_stay_json(self):
        for path in ('/api/missing', '/_astro/missing.js', '/uploads/missing.jpg'):
            response = self.client.get(path, headers={'Accept': 'text/html'})
            self.assertEqual(response.status_code, 404)
            self.assertIn('application/json', response.headers['content-type'])

    def test_uncaught_error_never_leaks_private_details(self):
        for accept in ('text/html', 'application/json'):
            response = self.client.get('/test-crash', headers={'Accept': accept})
            self.assertEqual(response.status_code, 500)
            self.assertNotIn('PRIVATE ERROR', response.text)
            self.assertIn('text/html' if accept == 'text/html' else 'application/json', response.headers['content-type'])


if __name__ == '__main__':
    unittest.main()
