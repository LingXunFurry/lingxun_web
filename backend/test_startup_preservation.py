import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, select, delete
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.main import create_app
from app.models import CharacterProfile, FriendLink, GalleryPhoto, Post, ScheduleItem, SocialLink


class StartupPreservationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        self.sessions = sessionmaker(bind=self.engine)

    def tearDown(self):
        self.engine.dispose()

    def startup(self):
        with patch('app.main.engine', self.engine), patch('app.main.SessionLocal', self.sessions), \
                patch('app.main.ensure_admin_account'), patch('app.main.seed_gallery') as gallery, \
                patch('app.main.seed_posts') as posts:
            app = create_app()
            for callback in app.router.on_startup:
                callback()
            return gallery.call_count, posts.call_count

    def test_existing_empty_collections_stay_empty(self):
        Base.metadata.create_all(self.engine)
        self.assertEqual(self.startup(), (0, 0))
        with self.sessions() as db:
            for model in (CharacterProfile, FriendLink, GalleryPhoto, Post, ScheduleItem, SocialLink):
                self.assertIsNone(db.scalar(select(model.id).limit(1)), model.__tablename__)

    def test_first_start_seeds_once_and_deletion_is_not_undone(self):
        self.assertEqual(self.startup(), (1, 1))
        with self.sessions() as db:
            self.assertIsNotNone(db.scalar(select(CharacterProfile.id).limit(1)))
            self.assertIsNotNone(db.scalar(select(SocialLink.id).limit(1)))
            for model in (CharacterProfile, FriendLink, ScheduleItem, SocialLink):
                db.execute(delete(model))
            db.commit()
        self.assertEqual(self.startup(), (0, 0))
        with self.sessions() as db:
            for model in (CharacterProfile, FriendLink, ScheduleItem, SocialLink):
                self.assertIsNone(db.scalar(select(model.id).limit(1)), model.__tablename__)

    def test_current_character_customization_survives_restart(self):
        Base.metadata.create_all(self.engine)
        with self.sessions() as db:
            db.add(CharacterProfile(name='凌巽', species='龙族', role='冒险者', introduction='', details=''))
            db.commit()
        self.startup()
        self.startup()
        with self.sessions() as db:
            character = db.scalar(select(CharacterProfile))
            self.assertEqual(character.species, '龙族')
            self.assertEqual(character.role, '冒险者')
            self.assertEqual(character.introduction, '')
            self.assertEqual(character.details, '')


if __name__ == '__main__':
    unittest.main()
