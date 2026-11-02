import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import require_admin
from app.database import Base, get_db
from app.models import Post, StoryChapter, PostComment, SiteContent
from app.routers import admin, public


class StoryChapterTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.story = Post(title='Test story', slug='test-story', date='2026.11.02', content='Original full text', is_character_story=True)
        self.normal = Post(title='Ordinary post', slug='ordinary', date='2026.11.02')
        self.db.add_all([self.story, self.normal]); self.db.commit()
        app = FastAPI(); app.include_router(admin.router); app.include_router(public.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[require_admin] = lambda: 'test-admin'
        self.app = app; self.client = TestClient(app)
        self.url = f'/api/admin/posts/{self.story.id}/chapters'

    def tearDown(self):
        self.client.close(); self.db.close(); self.engine.dispose()

    def create(self, **values):
        return self.client.post(self.url, json={'title': 'First chapter', 'label': 'Chapter 1', 'content': 'Text', 'is_published': True, **values})

    def test_chapters_do_not_become_post_cards_and_drafts_are_private(self):
        live = self.create(slug='first', sort_order=20).json()
        self.assertEqual(self.create(slug='draft', title='Secret draft', is_published=False).status_code, 201)
        self.assertEqual(len(self.client.get('/api/public/posts').json()), 2)
        stories = self.client.get('/api/public/stories').json()
        self.assertEqual(len(stories), 1)
        self.assertEqual([chapter['slug'] for chapter in stories[0]['chapters']], ['first'])
        self.assertNotIn('content', stories[0]['chapters'][0])
        self.assertEqual(self.client.get('/api/public/posts/test-story/chapters/draft').status_code, 404)
        self.assertEqual(self.client.get('/api/public/posts/test-story/chapters/first').json()['id'], live['id'])

    def test_order_and_stable_links_after_edit(self):
        first = self.create(slug='stable', sort_order=30).json()
        self.create(slug='earlier', sort_order=10)
        response = self.client.put(self.url + '/' + str(first['id']), json={'title': 'Renamed', 'content': 'New text', 'is_published': True, 'sort_order': 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['slug'], 'stable')
        self.assertEqual(self.client.get('/api/public/posts/test-story/chapters').json()[0]['slug'], 'stable')

    def test_validation_duplicates_and_parent_scope(self):
        chapter = self.create(slug='first').json()
        self.assertEqual(self.create(slug='first').status_code, 409)
        for values in [{'sort_order': -1}, {'title': '  '}, {'slug': '../bad'}, {'content': ' ', 'is_published': True}]:
            self.assertEqual(self.create(**values).status_code, 422)
        wrong = f'/api/admin/posts/{self.normal.id}/chapters/{chapter["id"]}'
        self.assertEqual(self.client.put(wrong, json={'title': 'Wrong'}).status_code, 404)
        self.assertEqual(self.client.delete(wrong).status_code, 404)
        self.assertEqual(self.client.patch(f'/api/admin/posts/{self.story.id}', json={'is_character_story': False}).status_code, 422)

    def test_authentication_and_parent_publication(self):
        chapter = self.create(slug='first').json()
        self.app.dependency_overrides.pop(require_admin)
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.create(title='Unauthenticated').status_code, 401)
        self.story.is_published = False; self.db.commit()
        self.assertEqual(self.client.get('/api/public/posts/test-story/chapters').status_code, 404)
        self.assertEqual(self.client.get('/api/public/posts/test-story/chapters/first').status_code, 404)

    def test_delete_chapter_retains_parent_text_and_comments(self):
        chapter = self.create().json()
        self.db.add(PostComment(post_id=self.story.id, author_id='visitor', content='Existing comment')); self.db.commit()
        self.assertEqual(self.client.delete(self.url + '/' + str(chapter['id'])).status_code, 200)
        self.db.refresh(self.story)
        self.assertEqual(self.story.content, 'Original full text')
        self.assertEqual(len(self.db.scalars(select(PostComment)).all()), 1)
        self.assertEqual(self.client.get('/api/public/posts/test-story').json()['chapters'], [])

    def test_migration_is_idempotent_and_keeps_legacy_body(self):
        from app.main import ensure_database_schema
        with self.engine.begin() as connection:
            connection.execute(text('ALTER TABLE posts DROP COLUMN story_status'))
        with patch('app.main.engine', self.engine):
            ensure_database_schema(); ensure_database_schema()
        self.db.expire_all()
        self.assertEqual(self.db.get(Post, self.story.id).content, 'Original full text')
        self.assertEqual(self.db.get(Post, self.story.id).story_status, 'standalone')

    def test_copy_migration_preserves_owner_customizations(self):
        from app.main import migrate_multi_character_copy
        self.db.add_all([
            SiteContent(key='hero.subtitle', value='一条龙在人类城镇的生活记录', group_name='Test', label='Subtitle', content_type='text'),
            SiteContent(key='hero.body', value='Owner written introduction', group_name='Test', label='Body', content_type='text'),
        ])
        self.db.commit()
        self.assertEqual(migrate_multi_character_copy(self.db), 1)
        self.assertEqual(migrate_multi_character_copy(self.db), 0)
        self.assertEqual(self.db.scalar(select(SiteContent).where(SiteContent.key == 'hero.body')).value, 'Owner written introduction')


if __name__ == '__main__': unittest.main()
