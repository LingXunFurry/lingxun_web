import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, inspect, text

from app.main import ensure_database_schema


class SchemaUpgradeTests(unittest.TestCase):
    def test_old_sqlite_upgrade_preserves_rows_and_is_repeatable(self):
        engine = create_engine('sqlite:///:memory:')
        tables = ('posts', 'gallery_photos', 'character_profiles', 'social_links', 'bonus_content')
        try:
            with engine.begin() as connection:
                for table in tables:
                    connection.execute(text(f'CREATE TABLE {table} (id INTEGER PRIMARY KEY, original TEXT)'))
                    connection.execute(text(f"INSERT INTO {table} VALUES (1, 'unchanged')"))
            with patch('app.main.engine', engine):
                self.assertTrue(ensure_database_schema())
                self.assertFalse(ensure_database_schema())
            with engine.connect() as connection:
                for table in tables:
                    self.assertEqual(connection.scalar(text(f'SELECT original FROM {table} WHERE id=1')), 'unchanged')
                self.assertEqual(connection.scalar(text('SELECT story_summary FROM posts WHERE id=1')), '')
                self.assertEqual(connection.scalar(text('SELECT details FROM character_profiles WHERE id=1')), '')
                self.assertEqual(connection.scalar(text('SELECT is_home_hero FROM gallery_photos WHERE id=1')), 0)
            self.assertIn('story_order', {c['name'] for c in inspect(engine).get_columns('posts')})
        finally:
            engine.dispose()

    def mysql_statements(self, partial=False):
        engine = MagicMock()
        engine.dialect.name = 'mysql'
        inspector = MagicMock()
        inspector.get_table_names.return_value = ['posts', 'gallery_photos', 'character_profiles', 'social_links']
        def columns(table):
            result = [{'name': 'id', 'nullable': False}]
            if partial and table in {'posts', 'character_profiles'}:
                result.append({'name': 'story_summary' if table == 'posts' else 'details', 'nullable': True})
            return result
        inspector.get_columns.side_effect = columns
        statements = []
        engine.begin.return_value.__enter__.return_value.execute.side_effect = lambda statement: statements.append(str(statement))
        with patch('app.main.engine', engine), patch('app.main.inspect', return_value=inspector):
            ensure_database_schema()
        return statements

    def test_mysql_text_upgrade_has_no_literal_default(self):
        statements = self.mysql_statements()
        self.assertFalse(any('TEXT' in sql and 'DEFAULT' in sql for sql in statements))
        for table, column in [('posts', 'story_summary'), ('character_profiles', 'details')]:
            add = statements.index(f'ALTER TABLE {table} ADD COLUMN {column} TEXT NULL')
            fill = statements.index(f"UPDATE {table} SET {column} = '' WHERE {column} IS NULL")
            constrain = statements.index(f'ALTER TABLE {table} MODIFY COLUMN {column} TEXT NOT NULL')
            self.assertLess(add, fill)
            self.assertLess(fill, constrain)

    def test_mysql_partial_text_upgrade_resumes_without_duplicate_column(self):
        statements = self.mysql_statements(partial=True)
        for table, column in [('posts', 'story_summary'), ('character_profiles', 'details')]:
            self.assertFalse(any(f'ADD COLUMN {column}' in sql for sql in statements))
            self.assertIn(f"UPDATE {table} SET {column} = '' WHERE {column} IS NULL", statements)
            self.assertIn(f'ALTER TABLE {table} MODIFY COLUMN {column} TEXT NOT NULL', statements)


if __name__ == '__main__':
    unittest.main()
