import io
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import GalleryPhoto
from app.routers.admin import replace_gallery_image


class GalleryReplacementTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    async def test_replacement_preserves_record_metadata(self):
        photo = GalleryPhoto(title="Kept", file_url="/uploads/old.webp", category="Custom",
                             sort_order=7, character_ids=[1, 2], is_home_hero=True,
                             hero_order=4, is_home_portrait=True, is_home_gallery=True, home_order=2)
        self.db.add(photo)
        self.db.commit()
        before = {key: getattr(photo, key) for key in ("id", "title", "category", "sort_order",
                  "character_ids", "is_home_hero", "hero_order", "is_home_portrait", "is_home_gallery", "home_order")}
        upload = UploadFile(filename="replacement.png", file=io.BytesIO(b"test"))
        with patch("app.routers.admin.save_image_upload", new=AsyncMock(return_value="/uploads/new.webp")):
            result = await replace_gallery_image(photo.id, upload, _="test", db=self.db)
        self.assertEqual(result.file_url, "/uploads/new.webp")
        self.assertEqual(result.original_filename, "replacement.png")
        self.assertEqual(before, {key: getattr(result, key) for key in before})

    async def test_missing_record_does_not_upload(self):
        with patch("app.routers.admin.save_image_upload", new=AsyncMock()) as save:
            with self.assertRaises(HTTPException) as error:
                await replace_gallery_image(999, UploadFile(filename="x.png", file=io.BytesIO()), _="test", db=self.db)
            self.assertEqual(error.exception.status_code, 404)
            save.assert_not_awaited()

    async def test_invalid_upload_keeps_old_image(self):
        photo = GalleryPhoto(file_url="/uploads/old.webp", original_filename="old.png")
        self.db.add(photo)
        self.db.commit()
        with patch("app.routers.admin.save_image_upload", new=AsyncMock(side_effect=HTTPException(400, "invalid image"))):
            with self.assertRaises(HTTPException):
                await replace_gallery_image(photo.id, UploadFile(filename="bad.txt", file=io.BytesIO()), _="test", db=self.db)
        self.db.refresh(photo)
        self.assertEqual(photo.file_url, "/uploads/old.webp")
        self.assertEqual(photo.original_filename, "old.png")


if __name__ == "__main__":
    unittest.main()
