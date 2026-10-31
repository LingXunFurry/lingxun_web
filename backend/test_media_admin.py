import asyncio
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.database import get_db
from app.auth import require_admin
from app.media import IMAGE_LIMIT, image_info, optimize_uploaded_url, save_image, upload_path
from app.models import GalleryPhoto, CharacterProfile, SiteContent
from app.routers.admin import create_post, save_homepage_media, update_post
from app.schemas import GalleryPhotoOut, HomepageMediaIn, PostIn, PostOut, PostPatch
from app.utils import save_image_upload
from app.routers import admin, public


class MediaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.setting = patch.object(settings, 'upload_dir', self.root)
        self.setting.start()

    def tearDown(self):
        self.setting.stop()
        self.temp.cleanup()

    def make_image(self, mode='RGB', size=(2400, 1800), format='PNG'):
        output = io.BytesIO()
        Image.new(mode, size, (50, 80, 120, 90) if mode == 'RGBA' else (50, 80, 120)).save(output, format)
        return output.getvalue()

    def test_new_upload_keeps_original_and_creates_small_renditions(self):
        content = self.make_image()
        url = save_image(content, 'gallery', 1920, 80)
        info = image_info(url)
        self.assertEqual(upload_path(info['original_url']).read_bytes(), content)
        self.assertLessEqual(max(info['width'], info['height']), 1920)
        self.assertEqual([variant['width'] for variant in info['variants']], [480, 960, 1920])
        self.assertTrue(all(upload_path(variant['src']).exists() for variant in info['variants']))
        self.assertEqual(info['original_bytes'], len(content))

    def test_transparency_and_no_upscale(self):
        url = save_image(self.make_image('RGBA', (320, 120)), 'icons', 256, 88)
        info = image_info(url)
        self.assertEqual(info['width'], 256)
        self.assertEqual(len(info['variants']), 1)
        with Image.open(upload_path(info['src'])) as image:
            self.assertIn('A', image.getbands())

    def test_existing_optimization_is_idempotent_and_preserves_url_bytes(self):
        source = self.root / 'old.jpg'
        content = self.make_image(format='JPEG')
        source.write_bytes(content)
        first = optimize_uploaded_url('/uploads/old.jpg')
        files = set(self.root.iterdir())
        self.assertEqual(optimize_uploaded_url('/uploads/old.jpg'), first)
        self.assertEqual(set(self.root.iterdir()), files)
        self.assertEqual(source.read_bytes(), content)

    def test_animation_remains_animated(self):
        output = io.BytesIO()
        Image.new('RGB', (24, 24), 'red').save(output, 'GIF', save_all=True, append_images=[Image.new('RGB', (24, 24), 'blue')], duration=80, loop=0)
        url = save_image(output.getvalue(), 'gallery', 1920, 80)
        with Image.open(upload_path(url)) as image:
            self.assertEqual(image.n_frames, 2)
        info = optimize_uploaded_url(url)
        self.assertTrue(info['animated'])
        self.assertEqual(image_info(url), info)

    def test_rejects_traversal_remote_missing_and_invalid_content(self):
        self.assertIsNone(upload_path('/uploads/../secret.jpg'))
        for url in ('https://example.com/a.jpg', '/uploads/missing.jpg', '/uploads/../../x.png'):
            with self.assertRaises(HTTPException):
                optimize_uploaded_url(url)
        with self.assertRaises(HTTPException):
            save_image(b'invalid', 'gallery', 1920, 80)

    def test_upload_reads_bounded_bytes(self):
        upload = UploadFile(filename='big.jpg', file=io.BytesIO(b'x' * (IMAGE_LIMIT + 100)))
        with self.assertRaises(HTTPException):
            asyncio.run(save_image_upload(upload, 'gallery'))
        self.assertEqual(upload.file.tell(), IMAGE_LIMIT + 1)


class HomepageAdminTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([GalleryPhoto(id=i, title=str(i), file_url=f'/uploads/{i}.webp', is_visible=i != 4) for i in range(1, 5)])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_homepage_saves_all_roles_and_order_in_one_transaction(self):
        result = save_homepage_media(HomepageMediaIn(hero_ids=[3, 1], portrait_id=2, gallery_ids=[2, 3, 1]), _='test', db=self.db)
        self.assertTrue(result['ok'])
        self.assertEqual(self.db.get(GalleryPhoto, 3).hero_order, 0)
        self.assertEqual(self.db.get(GalleryPhoto, 1).home_order, 2)
        self.assertTrue(self.db.get(GalleryPhoto, 2).is_home_portrait)
        self.assertFalse(self.db.get(GalleryPhoto, 1).is_home_portrait)
        marker = self.db.scalar(select(SiteContent).where(SiteContent.key == 'home.media_managed'))
        self.assertEqual(marker.value, 'true')

    def test_empty_selection_is_explicit_and_duplicates_or_hidden_are_rejected(self):
        save_homepage_media(HomepageMediaIn(), _='test', db=self.db)
        for values in ({'gallery_ids': [1, 1]}, {'hero_ids': [4]}, {'portrait_id': 999}):
            with self.assertRaises(HTTPException):
                save_homepage_media(HomepageMediaIn(**values), _='test', db=self.db)
        self.assertFalse(any(photo.is_home_hero for photo in self.db.scalars(select(GalleryPhoto))))

    def test_story_cover_is_independent_and_can_be_cleared_or_inherited(self):
        character = CharacterProfile(name='Dragon', image_url='/uploads/registry.webp')
        self.db.add(character)
        self.db.commit()
        post = create_post(PostIn(title='Story', date='2026.10.26', cover_url='/uploads/post.webp', story_cover_url='/uploads/story.webp', is_character_story=True, story_character_id=character.id), _='test', db=self.db)
        self.assertEqual(PostOut.model_validate(post).story_cover_url, '/uploads/story.webp')
        self.assertEqual(character.image_url, '/uploads/registry.webp')
        self.assertEqual(post.cover_url, '/uploads/post.webp')
        update_post(post.id, PostPatch(story_cover_url=''), _='test', db=self.db)
        self.assertEqual(post.story_cover_url, '')
        update_post(post.id, PostPatch(story_cover_url=None), _='test', db=self.db)
        self.assertIsNone(post.story_cover_url)


class MediaApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.setting = patch.object(settings, 'upload_dir', Path(self.temp.name))
        self.setting.start()
        self.engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.app = FastAPI()
        self.app.include_router(admin.router)
        self.app.include_router(public.router)
        def database():
            with Session(self.engine) as session:
                yield session
        self.app.dependency_overrides[get_db] = database
        self.app.dependency_overrides[require_admin] = lambda: 'test'
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        self.setting.stop()
        self.temp.cleanup()

    def test_upload_selection_and_public_serialization(self):
        image = io.BytesIO()
        Image.new('RGB', (1600, 1000), 'blue').save(image, 'JPEG')
        uploaded = self.client.post('/api/admin/gallery', data={'title': 'API photo'}, files={'file': ('test.jpg', image.getvalue(), 'image/jpeg')})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        photo = uploaded.json()
        self.assertEqual(len(photo['image']['variants']), 3)
        self.assertEqual(self.client.put('/api/admin/homepage/media', json={'hero_ids': [photo['id']], 'portrait_id': photo['id'], 'gallery_ids': [photo['id']]}).status_code, 200)
        public_photo = self.client.get('/api/public/gallery').json()[0]
        self.assertTrue(public_photo['is_home_gallery'])
        self.assertEqual(public_photo['image']['original_bytes'], len(image.getvalue()))
        workshop = self.client.get('/api/admin/media').json()
        self.assertEqual(workshop[0]['url'], photo['file_url'])
        self.assertTrue(workshop[0]['image'])

    def test_new_optimization_endpoint_requires_auth(self):
        self.app.dependency_overrides.pop(require_admin)
        self.assertEqual(self.client.post('/api/admin/media/optimize', json={'url': '/uploads/test.jpg'}).status_code, 401)
        self.assertEqual(self.client.put('/api/admin/homepage/media', json={}).status_code, 401)


if __name__ == '__main__':
    unittest.main()
