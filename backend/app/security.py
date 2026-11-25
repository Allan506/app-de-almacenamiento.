from __future__ import annotations

import hashlib
import hmac
import mimetypes
import re
import secrets
import unicodedata
from datetime import timedelta

import jwt
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Node, User, utcnow

settings = get_settings()

_SAFE_NAME = re.compile(r"[\\/:*?\"<>|\x00-\x1f]")


def create_access_token(user: User) -> str:
    now = utcnow()
    payload = {
        "sub": user.id,
        "email": user.email,
        "ver": user.token_version,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.jwt_expire_days)).timestamp()),
    }
    return jwt.encode(payload, settings.resolved_secret, algorithm=settings.jwt_algorithm)


def create_media_token(user: User, minutes: int = 15) -> str:
    now = utcnow()
    payload = {
        "sub": user.id,
        "ver": user.token_version,
        "scope": "media",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.resolved_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.resolved_secret, algorithms=[settings.jwt_algorithm])


def hash_code(email: str, code: str) -> str:
    message = f"{email.lower().strip()}:{code}".encode()
    return hmac.new(settings.resolved_secret.encode(), message, hashlib.sha256).hexdigest()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 260_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, digest = encoded.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
    return hmac.compare_digest(candidate, digest)


def sanitize_name(name: str, fallback: str = "archivo") -> str:
    name = unicodedata.normalize("NFC", name or "")
    name = name.replace("/", "-").replace("\\", "-")
    name = _SAFE_NAME.sub("", name).strip().strip(".")
    name = re.sub(r"\s+", " ", name)
    if not name:
        name = fallback
    return name[:200]


def split_name(name: str) -> tuple[str, str]:
    if "." in name[1:]:
        stem, ext = name.rsplit(".", 1)
        return stem, f".{ext}"
    return name, ""


def unique_name(db: Session, owner_id: str, parent_id: str | None, name: str) -> str:
    """Append " (n)" until the name is free among live siblings."""
    stem, ext = split_name(name)
    candidate = name
    counter = 1
    while True:
        stmt = select(func.count(Node.id)).where(
            Node.owner_id == owner_id,
            Node.name == candidate,
            Node.deleted_at.is_(None),
        )
        stmt = stmt.where(Node.parent_id.is_(None)) if parent_id is None else stmt.where(Node.parent_id == parent_id)
        if not db.scalar(stmt):
            return candidate
        candidate = f"{stem} ({counter}){ext}"
        counter += 1


def guess_mime(name: str, provided: str | None = None) -> str:
    if provided and provided != "application/octet-stream":
        return provided
    guessed, _ = mimetypes.guess_type(name)
    return guessed or "application/octet-stream"


def human_size(size: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{size} B"
