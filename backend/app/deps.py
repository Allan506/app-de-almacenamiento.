from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized()
    return _user_from_token(db, credentials.credentials)


def get_media_user(
    request: Request,
    t: str | None = Query(None),
    db: Session = Depends(get_db),
) -> User:
    """Accept either a Bearer header or a short-lived `t` query token (img/video tags cannot send headers)."""
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else t
    if not token:
        raise _unauthorized()
    return _user_from_token(db, token)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesion no valida o expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _user_from_token(db: Session, token: str) -> User:
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise _unauthorized() from None

    if payload.get("scope") not in (None, "media"):
        raise _unauthorized()

    user = db.get(User, payload.get("sub"))
    if user is None or payload.get("ver") != user.token_version:
        raise _unauthorized()
    return user
