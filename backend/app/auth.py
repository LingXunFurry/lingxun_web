import base64
from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import AdminAccount


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")
PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    encoded_salt = base64.urlsafe_b64encode(salt).decode("ascii")
    encoded_digest = base64.urlsafe_b64encode(digest).decode("ascii")
    return f"{PASSWORD_HASH_ALGORITHM}${PASSWORD_HASH_ITERATIONS}${encoded_salt}${encoded_digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, encoded_salt, expected_digest = password_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False
        salt = base64.urlsafe_b64decode(encoded_salt.encode("ascii"))
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
        encoded_digest = base64.urlsafe_b64encode(digest).decode("ascii")
        return secrets.compare_digest(encoded_digest, expected_digest)
    except (ValueError, TypeError):
        return False


def ensure_admin_account(db: Session) -> AdminAccount:
    account = db.scalar(select(AdminAccount).order_by(AdminAccount.id.asc()).limit(1))
    if account:
        return account

    if not settings.admin_username or not settings.admin_password:
        raise RuntimeError(
            "No admin account exists. Set ADMIN_USERNAME and ADMIN_PASSWORD once, "
            "or run backend/reset_admin_password.py from the server."
        )

    account = AdminAccount(
        username=settings.admin_username,
        password_hash=hash_password(settings.admin_password),
        token_version=1,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def authenticate_admin(db: Session, username: str, password: str) -> AdminAccount | None:
    account = db.scalar(select(AdminAccount).where(AdminAccount.username == username.strip()))
    if not account:
        return None
    if not verify_password(password, account.password_hash):
        return None
    return account


def create_access_token(account: AdminAccount) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": account.username, "ver": account.token_version, "exp": expires}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def require_admin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> str:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="登录状态已失效，请重新登录。",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        subject = payload.get("sub")
        token_version = int(payload.get("ver") or 0)
    except JWTError as exc:
        raise credentials_error from exc
    if not subject:
        raise credentials_error
    account = db.scalar(select(AdminAccount).where(AdminAccount.username == subject))
    if not account or account.token_version != token_version:
        raise credentials_error
    return account.username


def change_admin_password(db: Session, username: str, current_password: str, new_password: str) -> AdminAccount | None:
    account = authenticate_admin(db, username, current_password)
    if not account:
        return None
    account.password_hash = hash_password(new_password)
    account.token_version += 1
    db.commit()
    db.refresh(account)
    return account
