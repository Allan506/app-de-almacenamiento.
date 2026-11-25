from __future__ import annotations

import secrets
from datetime import timedelta
from urllib.parse import quote

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Node, Share, User, utcnow
from ..schemas import ShareCreate, ShareInfo, ShareOut, ShareUnlock
from ..security import hash_password, verify_password
from ..services import get_owned, log_activity, serialize_nodes
from .nodes import _content_response, _remove_temp, _zip_folder

settings = get_settings()
router = APIRouter(prefix="/api", tags=["shares"])
public = APIRouter(prefix="/api/public", tags=["public"])

SHARE_SCOPE = "share"


def _share_url(token: str) -> str:
    return f"{settings.app_url.rstrip('/')}/s/{token}"


def _to_out(share: Share, node: Node | None) -> ShareOut:
    payload = ShareOut.model_validate(share)
    payload.has_password = bool(share.password_hash)
    payload.url = _share_url(share.token)
    if node is not None:
        payload.node_name = node.name
        payload.node_kind = node.kind
        payload.node_size = node.size
        payload.node_mime = node.mime_type
    return payload


def _create_share_token(share: Share) -> str:
    now = utcnow()
    payload = {
        "scope": SHARE_SCOPE,
        "share": share.token,
        "exp": int((now + timedelta(hours=6)).timestamp()),
    }
    return jwt.encode(payload, settings.resolved_secret, algorithm=settings.jwt_algorithm)


def _check_access(share: Share, token: str | None) -> None:
    if not share.password_hash:
        return
    if not token:
        raise HTTPException(status_code=401, detail="Este enlace requiere contrasena")
    try:
        payload = jwt.decode(token, settings.resolved_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Acceso caducado, introduce la contrasena de nuevo") from None
    if payload.get("scope") != SHARE_SCOPE or payload.get("share") != share.token:
        raise HTTPException(status_code=401, detail="Acceso no valido")


def _resolve(db: Session, token: str) -> tuple[Share, Node]:
    share = db.scalars(select(Share).where(Share.token == token)).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Enlace no encontrado")
    if share.expires_at and share.expires_at < utcnow():
        raise HTTPException(status_code=410, detail="Este enlace ha caducado")
    node = db.get(Node, share.node_id)
    if node is None or node.deleted_at is not None:
        raise HTTPException(status_code=404, detail="El contenido ya no esta disponible")
    return share, node


@router.post("/shares", response_model=ShareOut, status_code=status.HTTP_201_CREATED)
def create_share(payload: ShareCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    node = get_owned(db, user, payload.node_id)

    existing = db.scalars(
        select(Share).where(Share.node_id == node.id, Share.owner_id == user.id)
    ).first()
    if existing and not payload.password:
        return _to_out(existing, node)

    share = Share(
        token=secrets.token_urlsafe(16),
        node_id=node.id,
        owner_id=user.id,
        password_hash=hash_password(payload.password) if payload.password else None,
        allow_download=payload.allow_download,
        expires_at=utcnow() + timedelta(hours=payload.expires_in_hours) if payload.expires_in_hours else None,
    )
    db.add(share)
    log_activity(db, user, "share", node)
    db.commit()
    db.refresh(share)
    return _to_out(share, node)


@router.get("/shares", response_model=list[ShareOut])
def list_shares(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(
        select(Share).where(Share.owner_id == user.id).order_by(Share.created_at.desc())
    ).all()
    nodes = {
        node.id: node
        for node in db.scalars(select(Node).where(Node.id.in_([row.node_id for row in rows]))).all()
    } if rows else {}
    return [_to_out(row, nodes.get(row.node_id)) for row in rows]


@router.delete("/shares/{share_id}")
def delete_share(share_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    share = db.get(Share, share_id)
    if share is None or share.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Enlace no encontrado")
    db.delete(share)
    db.commit()
    return {"ok": True}


@public.get("/shares/{token}", response_model=ShareInfo)
def share_info(token: str, db: Session = Depends(get_db)):
    share, node = _resolve(db, token)
    owner = db.get(User, share.owner_id)
    return ShareInfo(
        token=share.token,
        name=node.name,
        kind=node.kind,
        size=node.size,
        mime_type=node.mime_type,
        owner=(owner.display_name or owner.email.split("@")[0]) if owner else "Usuario",
        created_at=share.created_at,
        expires_at=share.expires_at,
        allow_download=share.allow_download,
        requires_password=bool(share.password_hash),
        download_count=share.download_count,
    )


@public.post("/shares/{token}/unlock")
def unlock_share(token: str, payload: ShareUnlock, db: Session = Depends(get_db)):
    share, _ = _resolve(db, token)
    if not share.password_hash:
        return {"access": _create_share_token(share)}
    if not verify_password(payload.password, share.password_hash):
        raise HTTPException(status_code=401, detail="Contrasena incorrecta")
    return {"access": _create_share_token(share)}


@public.get("/shares/{token}/items")
def share_items(token: str, access: str | None = Query(None), db: Session = Depends(get_db)):
    share, node = _resolve(db, token)
    _check_access(share, access)
    if node.kind != "folder":
        raise HTTPException(status_code=400, detail="Este enlace no es una carpeta")
    children = db.scalars(
        select(Node).where(Node.parent_id == node.id, Node.deleted_at.is_(None))
    ).all()
    return serialize_nodes(db, children, share.owner_id)


@public.get("/shares/{token}/raw")
def share_raw(token: str, access: str | None = Query(None), db: Session = Depends(get_db)):
    share, node = _resolve(db, token)
    _check_access(share, access)
    if node.kind == "folder":
        raise HTTPException(status_code=400, detail="Las carpetas no se pueden previsualizar")
    return _content_response(node, inline=True)


@public.get("/shares/{token}/download")
def share_download(
    token: str,
    background: BackgroundTasks,
    access: str | None = Query(None),
    node_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    share, node = _resolve(db, token)
    _check_access(share, access)
    if not share.allow_download:
        raise HTTPException(status_code=403, detail="El propietario desactivo las descargas")

    target = node
    if node_id:
        candidate = db.get(Node, node_id)
        if candidate is None or candidate.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        if candidate.id != node.id and candidate.parent_id != node.id:
            raise HTTPException(status_code=403, detail="Ese archivo no forma parte del enlace compartido")
        target = candidate

    share.download_count += 1
    db.commit()

    if target.kind == "folder":
        archive = _zip_folder(db, target)
        background.add_task(_remove_temp, archive)
        return FileResponse(
            archive,
            media_type="application/zip",
            filename=f"{target.name}.zip",
            background=background,
        )
    return _content_response(target, inline=False)
