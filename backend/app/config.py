from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent

load_dotenv(BASE_DIR / ".env")


class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:password@127.0.0.1:3306/lingxun_website?charset=utf8mb4",
    )
    admin_username: str = os.getenv("ADMIN_USERNAME", "lingxun")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "lxloveshy")
    jwt_secret_key: str = os.getenv(
        "JWT_SECRET_KEY",
        "dev-only-lingxun-admin-secret-change-before-deploy",
    )
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = int(os.getenv("JWT_EXPIRE_MINUTES", "30"))
    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "BACKEND_CORS_ORIGINS",
            "http://localhost:4321,http://127.0.0.1:4321,http://localhost:8080,http://127.0.0.1:8080",
        ).split(",")
        if origin.strip()
    ]
    upload_dir: Path = BASE_DIR / "uploads"
    admin_static_dir: Path = BASE_DIR / "app" / "static" / "admin"
    project_dir: Path = PROJECT_DIR
    dist_dir: Path = PROJECT_DIR / "dist"


settings = Settings()
