import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.database import Base
from app.main import migrate_contact_copy
from app.models import SiteContent, SocialLink


class ContactCopyMigrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add(self, key, value, label="自定义标签"):
        row = SiteContent(key=key, value=value, label=label)
        self.db.add(row)
        self.db.commit()
        return row

    def test_shipped_defaults_and_labels_migrate_once(self):
        menu = self.add("navbar.contact", "酒馆入口", "联系方式菜单名称")
        eyebrow = self.add("final.contact_eyebrow", "酒馆入口 / Find Lingxun", "联系眉题")
        empty = self.add("navbar.empty", "暂无入口")
        home = self.add("common.back_home", "返回酒馆入口")
        self.assertEqual(migrate_contact_copy(self.db), 4)
        self.assertEqual((menu.value, menu.label), ("联系凌巽", "联系凌巽菜单名称"))
        self.assertEqual((eyebrow.value, eyebrow.label), ("联系凌巽 / Find Lingxun", "联系凌巽眉题"))
        self.assertEqual(empty.value, "暂无联系方式")
        self.assertEqual(home.value, "返回首页")
        self.assertEqual(migrate_contact_copy(self.db), 0)

    def test_custom_values_labels_and_unrelated_content_are_preserved(self):
        menu = self.add("navbar.contact", "给凌巽写信")
        eyebrow = self.add("final.contact_eyebrow", "我的联系名片")
        unrelated = self.add("hero.title", "酒馆入口")
        self.assertEqual(migrate_contact_copy(self.db), 0)
        self.assertEqual(menu.value, "给凌巽写信")
        self.assertEqual(menu.label, "自定义标签")
        self.assertEqual(eyebrow.value, "我的联系名片")
        self.assertEqual(unrelated.value, "酒馆入口")

    def test_metadata_update_does_not_overwrite_custom_value(self):
        menu = self.add("navbar.contact", "我的名片", "联系方式菜单名称")
        self.assertEqual(migrate_contact_copy(self.db), 1)
        self.assertEqual(menu.value, "我的名片")
        self.assertEqual(menu.label, "联系凌巽菜单名称")

    def test_empty_database_and_contacts_are_untouched(self):
        self.assertEqual(migrate_contact_copy(self.db), 0)
        social = SocialLink(name="QQ 群", icon="QQ", desc="群聊", link="https://qm.qq.com/q/hrqvQDmSjK", number="1105367000")
        self.db.add(social)
        self.db.commit()
        self.add("navbar.contact", "酒馆入口")
        migrate_contact_copy(self.db)
        saved = self.db.scalar(select(SocialLink))
        self.assertEqual((saved.link, saved.number), ("https://qm.qq.com/q/hrqvQDmSjK", "1105367000"))


if __name__ == "__main__":
    unittest.main()
