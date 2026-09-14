"""Public ordering regressions, isolated from the site's database."""
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Post
from app.routers.public import list_character_stories, list_posts
from app.routers.admin import update_post
from app.schemas import PostPatch
from fastapi import HTTPException


class PublicOrderingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add(self, slug, date, **values):
        self.db.add(Post(slug=slug, title=slug, date=date, **values))
        self.db.commit()

    def test_multiple_pins_and_unpinned_dates(self):
        self.add("older", "2026.01.01", pin_order=-10)
        self.add("newer", "2026.09.01", pin_order=99)
        self.add("pin-second", "2026.08.01", is_pinned=True, pin_order=2)
        self.add("pin-first", "2026.07.01", is_pinned=True, pin_order=1)
        self.add("draft", "2026.09.02", is_published=False, is_pinned=True)
        self.assertEqual([p.slug for p in list_posts(self.db)],
                         ["pin-first", "pin-second", "newer", "older"])

    def test_stories_respect_publication_and_order(self):
        self.add("second", "2026.08.01", is_character_story=True, story_order=2)
        self.add("first", "2026.07.01", is_character_story=True, story_order=1)
        self.add("ordinary", "2026.09.01")
        self.add("draft", "2026.09.02", is_character_story=True, is_published=False)
        self.assertEqual([p.slug for p in list_character_stories(self.db)], ["first", "second"])

    def test_title_edit_keeps_existing_story_link(self):
        self.add("post-original", "2026.08.01", is_character_story=True)
        post = list_posts(self.db)[0]
        updated = update_post(post.id, PostPatch(title="New title"), _="test", db=self.db)
        self.assertEqual(updated.slug, "post-original")

    def test_invalid_story_character_is_rejected(self):
        self.add("story", "2026.08.01")
        post = list_posts(self.db)[0]
        with self.assertRaises(HTTPException) as error:
            update_post(post.id, PostPatch(story_character_id=999), _="test", db=self.db)
        self.assertEqual(error.exception.status_code, 422)
        self.assertIsNone(post.story_character_id)

    def test_null_order_is_rejected_before_database_write(self):
        self.add("story", "2026.08.01")
        post = list_posts(self.db)[0]
        with self.assertRaises(HTTPException) as error:
            update_post(post.id, PostPatch(pin_order=None), _="test", db=self.db)
        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(post.pin_order, 0)


if __name__ == "__main__":
    unittest.main()
