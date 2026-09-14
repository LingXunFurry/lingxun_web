import unittest
from urllib.parse import urlencode

from fastapi import HTTPException, Request
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Post, PostComment, SiteStats
from app.routers.public import create_post_comment, list_post_comments, record_visit, record_interaction, like_post_comment


class PublicInteractionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as db:
            db.add_all([Post(id=1, slug='test', title='Test', date='2026.09.09', tag='UPDATE', desc='', content='Body', is_published=True),
                        Post(id=2, slug='other', title='Other', date='2026.09.09', tag='UPDATE', desc='', content='Body', is_published=True),
                        SiteStats(id=1, visit_count=0, interaction_count=0)])
            db.commit()

    def tearDown(self):
        self.engine.dispose()

    async def create_comment(self, data, slug='test'):
        async def receive():
            return {'type': 'http.request', 'body': urlencode(data).encode(), 'more_body': False}
        request = Request({'type': 'http', 'method': 'POST', 'headers': [(b'content-type', b'application/x-www-form-urlencoded')]}, receive)
        with Session(self.engine) as db:
            return await create_post_comment(slug, request, db=db)

    async def test_comment_reply_like_and_visibility(self):
        root = await self.create_comment({'author_id': ' Guest ', 'content': ' Hello '})
        self.assertEqual((root.author_id, root.content), ('Guest', 'Hello'))
        reply = await self.create_comment({'author_id': 'Reply', 'content': 'Response', 'parent_id': root.id})
        self.assertEqual(reply.parent_id, root.id)
        with Session(self.engine) as db:
            self.assertEqual(like_post_comment('test', root.id, db=db).like_count, 1)
            self.assertEqual(len(list_post_comments('test', db=db)), 2)
        with self.assertRaises(HTTPException) as error:
            await self.create_comment({'author_id': 'Reply', 'content': 'Wrong post', 'parent_id': root.id}, slug='other')
        self.assertEqual(error.exception.status_code, 404)
        with Session(self.engine) as db:
            db.get(Post, 1).is_published = False
            db.commit()
        with Session(self.engine) as db:
            with self.assertRaises(HTTPException) as error:
                list_post_comments('test', db=db)
            self.assertEqual(error.exception.status_code, 404)
            with self.assertRaises(HTTPException) as error:
                like_post_comment('test', root.id, db=db)
            self.assertEqual(error.exception.status_code, 404)

    async def test_invalid_comment_inputs(self):
        for data in [{'author_id': '', 'content': 'x'}, {'author_id': 'x', 'content': ''},
                     {'author_id': 'x' * 81, 'content': 'x'}, {'author_id': 'x', 'content': 'x' * 1001},
                     {'author_id': 'x', 'content': 'x', 'parent_id': 'invalid'}]:
            with self.assertRaises(HTTPException) as error:
                await self.create_comment(data)
            self.assertEqual(error.exception.status_code, 400)

    def test_counters_do_not_lose_updates_from_stale_sessions(self):
        for action, field in [(record_visit, 'visit_count'), (record_interaction, 'interaction_count')]:
            with Session(self.engine) as first, Session(self.engine) as second:
                old_first, old_second = first.get(SiteStats, 1), second.get(SiteStats, 1)
                self.assertEqual(getattr(old_first, field), getattr(old_second, field))
                action(db=first)
                action(db=second)
            with Session(self.engine) as db:
                self.assertEqual(getattr(db.get(SiteStats, 1), field), 2)

    def test_likes_do_not_lose_updates_from_stale_sessions(self):
        with Session(self.engine) as db:
            db.add(PostComment(id=1, post_id=1, author_id='Guest', avatar_url='', content='Hello', like_count=0, is_visible=True))
            db.commit()
        with Session(self.engine) as first, Session(self.engine) as second:
            old_first, old_second = first.get(PostComment, 1), second.get(PostComment, 1)
            self.assertEqual(old_first.like_count, old_second.like_count)
            like_post_comment('test', 1, db=first)
            like_post_comment('test', 1, db=second)
        with Session(self.engine) as db:
            self.assertEqual(db.get(PostComment, 1).like_count, 2)


if __name__ == '__main__':
    unittest.main()
