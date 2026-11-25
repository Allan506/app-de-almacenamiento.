from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Node, User, utcnow
from ..otp import OtpError, check_code, issue_code
from ..schemas import AuthResult, OtpRequest, OtpRequestResult, OtpVerify, UserOut, UserUpdate
from ..security import create_access_token, create_media_token
from ..services import log_activity

logger = logging.getLogger("nube.auth")
settings = get_settings()
router = APIRouter(prefix="/api/auth", tags=["auth"])

PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#06b6d4", "#3b82f6", "#eab308"]


def _display_name(email: str) -> str:
    local = email.split("@")[0].replace(".", " ").replace("_", " ").strip()
    return (local[:60].title() or "Usuario")


@router.get("/config")
def auth_config() -> dict:
    return {
        "app_name": settings.app_name,
        "channel": settings.resolved_channel,
        "dev_mode": settings.dev_mode,
        "otp_length": settings.otp_length,
        "resend_after": settings.otp_resend_cooldown,
        "max_upload_bytes": settings.max_upload_bytes,
        "storage_backend": settings.storage_backend,
    }


@router.post("/otp/request", response_model=OtpRequestResult)
async def request_otp(payload: OtpRequest, request: Request, db: Session = Depends(get_db)):
    email = str(payload.email).lower().strip()
    is_new_user = db.scalar(select(func.count(User.id)).where(User.email == email)) == 0
    client_ip = request.client.host if request.client else None

    try:
        channel, resend_after, code = await issue_code(db, email, client_ip)
    except OtpError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.message,
            headers={"Retry-After": str(exc.retry_after)} if exc.retry_after else None,
        ) from exc

    if settings.dev_mode:
        logger.info("OTP de desarrollo para %s: %s", email, code)

    return OtpRequestResult(
        message=f"Enviamos un codigo de {settings.otp_length} digitos a {email}",
        channel=channel,
        expires_in=settings.otp_ttl_seconds,
        resend_after=resend_after,
        dev_code=code if settings.dev_mode else None,
        is_new_user=is_new_user,
    )


@router.post("/otp/verify", response_model=AuthResult)
def verify_otp(payload: OtpVerify, db: Session = Depends(get_db)):
    email = str(payload.email).lower().strip()
    try:
        check_code(db, email, payload.code)
    except OtpError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.message,
            headers={"Retry-After": str(exc.retry_after)} if exc.retry_after else None,
        ) from exc

    user = db.scalars(select(User).where(User.email == email)).first()
    is_new_user = user is None
    if user is None:
        user = User(
            email=email,
            display_name=_display_name(email),
            color=PALETTE[sum(email.encode()) % len(PALETTE)],
        )
        db.add(user)
        db.flush()

    user.last_login_at = utcnow()
    log_activity(db, user, "login")
    db.commit()
    db.refresh(user)

    return AuthResult(
        access_token=create_access_token(user),
        user=UserOut.model_validate(user),
        is_new_user=is_new_user,
    )


@router.post("/media-token")
def media_token(user: User = Depends(get_current_user)):
    """Short-lived token for <img>/<video> URLs and direct downloads."""
    return {"token": create_media_token(user), "expires_in": 900}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_me(payload: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.display_name = payload.display_name.strip()
    db.commit()
    return UserOut.model_validate(user)


@router.post("/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.token_version += 1
    db.commit()
    return {"ok": True}


@router.delete("/me")
def delete_account(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from ..storage import get_storage

    storage = get_storage()
    nodes = db.scalars(select(Node).where(Node.owner_id == user.id)).all()
    for node in nodes:
        if node.storage_key:
            try:
                storage.delete(node.storage_key)
            except Exception:  # best effort cleanup
                logger.warning("No se pudo borrar el objeto %s", node.storage_key)
    db.delete(user)
    db.commit()
    return {"ok": True, "removed_files": len(nodes)}


@router.get("/session")
def session_info(user: User = Depends(get_current_user)) -> dict:
    return {
        "email": user.email,
        "expires_in_days": settings.jwt_expire_days,
        "created_at": (user.created_at.isoformat() + "Z"),
        "member_since_days": max(0, (utcnow() - user.created_at).days),
        "token_ttl": str(timedelta(days=settings.jwt_expire_days)),
    }
