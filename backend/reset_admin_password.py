from __future__ import annotations

import getpass
import os
from pathlib import Path
import sys

from sqlalchemy import select

os.chdir(Path(__file__).resolve().parent)

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import AdminAccount


def main() -> int:
    username = sys.argv[1].strip() if len(sys.argv) > 1 else input("Admin username: ").strip()
    password = sys.argv[2] if len(sys.argv) > 2 else getpass.getpass("New password: ")

    if not username:
        print("Username cannot be empty.")
        return 1
    if len(password) < 6:
        print("Password must be at least 6 characters.")
        return 1

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        account = db.scalar(select(AdminAccount).where(AdminAccount.username == username))
        if not account:
            account = AdminAccount(username=username, password_hash=hash_password(password), token_version=1)
            db.add(account)
        else:
            account.password_hash = hash_password(password)
            account.token_version += 1
        db.commit()

    print(f"Password reset for admin user: {username}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
