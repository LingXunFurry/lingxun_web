from pathlib import Path
import re
import unittest

from sqlalchemy import create_engine, text

from app.database import Base
from app import models  # Register mapped tables for the isolated fixture.


class SqlSeedGuardTests(unittest.TestCase):
    def test_seed_statements_preserve_existing_and_deleted_collections(self):
        script = (Path(__file__).resolve().parents[1] / "sql" / "admin_schema.sql").read_text(encoding="utf-8")
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        try:
            with engine.begin() as connection:
                for table, guard, expected in [
                    ("schedule_items", "seed_schedules", 3),
                    ("social_links", "seed_socials", 6),
                    ("friend_links", "seed_friends", 5),
                ]:
                    statements = re.findall(rf"INSERT INTO {table}\b[^;]+;", script)
                    self.assertEqual(len(statements), expected)
                    self.assertLess(script.index(f"SET @{guard}"), script.index(f"CREATE TABLE IF NOT EXISTS {table}"))
                    for statement in statements:
                        self.assertIn(f"WHERE @{guard} AND", statement)
                        connection.exec_driver_sql(statement, {guard: True})
                    self.assertEqual(connection.scalar(text(f"SELECT COUNT(*) FROM {table}")), expected)
                    connection.execute(text(f"DELETE FROM {table} WHERE id != 1"))
                    for statement in statements:
                        connection.exec_driver_sql(statement, {guard: False})
                    self.assertEqual(connection.scalar(text(f"SELECT COUNT(*) FROM {table}")), 1)
                    connection.execute(text(f"DELETE FROM {table}"))
                    for statement in statements:
                        connection.exec_driver_sql(statement, {guard: False})
                    self.assertEqual(connection.scalar(text(f"SELECT COUNT(*) FROM {table}")), 0)
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
