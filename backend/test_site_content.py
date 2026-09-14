import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.main import ensure_site_content
from app.models import SiteContent
from app.routers.admin import update_site_content
from app.schemas import SiteContentPatch
from app.site_content import iter_default_site_content


class SiteContentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_defaults_unique_and_seed_idempotent(self):
        defaults = list(iter_default_site_content())
        self.assertEqual(len(defaults), len({item['key'] for item in defaults}))
        ensure_site_content(self.db)
        original = [(row.id, row.key, row.value) for row in self.db.scalars(select(SiteContent)).all()]
        ensure_site_content(self.db)
        self.assertEqual(original, [(row.id, row.key, row.value) for row in self.db.scalars(select(SiteContent)).all()])
        self.assertEqual(len(defaults), len(original))

    def test_seed_preserves_custom_and_explicit_empty_values(self):
        ensure_site_content(self.db)
        rows = self.db.scalars(select(SiteContent).limit(2)).all()
        for row, value in zip(rows, ['Custom\nmultiline content', '']):
            update_site_content(row.id, SiteContentPatch(value=value), _='test', db=self.db)
        ensure_site_content(self.db)
        self.assertEqual(rows[0].value, 'Custom\nmultiline content')
        self.assertEqual(rows[1].value, '')
        self.db.expire_all()
        self.assertEqual(self.db.get(SiteContent, rows[1].id).value, '')

    def test_partial_seed_keeps_unknown_content(self):
        custom = SiteContent(key='custom.local', label='Custom', value='Kept')
        self.db.add(custom)
        self.db.commit()
        ensure_site_content(self.db)
        self.db.refresh(custom)
        self.assertEqual(custom.value, 'Kept')
        self.assertEqual(len(self.db.scalars(select(SiteContent)).all()), len(list(iter_default_site_content())) + 1)

    def test_missing_record_is_404(self):
        with self.assertRaises(HTTPException) as error:
            update_site_content(999, SiteContentPatch(value='x'), _='test', db=self.db)
        self.assertEqual(error.exception.status_code, 404)

    def test_patch_requires_explicit_value(self):
        for payload in [{}, {'value': None}]:
            with self.assertRaises(ValidationError):
                SiteContentPatch.model_validate(payload)
        self.assertEqual(SiteContentPatch(value='').value, '')


if __name__ == '__main__':
    unittest.main()
