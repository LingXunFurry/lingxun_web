from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import select

os.chdir(Path(__file__).resolve().parent)

from app.database import SessionLocal
from app.models import GalleryPhoto, Post
from app.utils import optimize_existing_upload_url


def main() -> int:
    changed_gallery = 0
    changed_covers = 0

    with SessionLocal() as db:
        for photo in db.scalars(select(GalleryPhoto)).all():
            new_url = optimize_existing_upload_url(photo.file_url, max_dimension=1280, quality=76)
            if new_url:
                photo.file_url = new_url
                changed_gallery += 1

        for post in db.scalars(select(Post).where(Post.cover_url.is_not(None))).all():
            new_url = optimize_existing_upload_url(post.cover_url, max_dimension=1280, quality=76)
            if new_url:
                post.cover_url = new_url
                changed_covers += 1

        db.commit()

    print(f"Optimized gallery images: {changed_gallery}")
    print(f"Optimized post covers: {changed_covers}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
