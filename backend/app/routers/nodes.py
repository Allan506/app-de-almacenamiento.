from __future__ import annotations

import os
import tempfile
import zipfile
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import case, delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user, get_media_user
from ..models import Activity, Node, Share, User, utcnow
from ..schemas import ActivityOut, Breadcrumb, FolderCreate, NodeList, NodeOut, NodeUpdate, StatsOut, TypeUsage
from ..security import guess_mime, sanitize_name, unique_name
from ..services import (
    breadcrumb,
    child_ids,
    get_folder,
    get_owned,
    log_activity,
    mark_trashed,
    serialize_nodes,
    subtree,
    used_bytes,
)
from ..storage import get_storage, new_key

settings = get_settings()
router = APIRouter(prefix="/api", tags=["drive"])

INLINE_BLOCKED = {"text/html", "application/xhtml+xml", "image/svg+xml", "application/javascript", "text/xml"}

TYPE_GROUPS = {
    "Imagenes": ("image/",),
    "Videos": ("video/",),
    "Audio": ("audio/",),
    "Documentos": ("application/pdf", "text/", "application/msword", "application/vnd.openxmlformats"),
    "Archivos": ("application/zip", "application/x-rar", "application/x-7z", "application/gzip", "application/x-tar"),
}


def _sort_clause(sort: str):
    descending = sort.startswith("-")
    field = sort.lstrip("-")
    column = {
        "name": Node.name,
        "date": Node.created_at,
        "size": Node.size,
        "type": Node.mime_type,
    }.get(field, Node.name)
    direction = column.desc() if descending else column.asc()
    return (case((Node.kind == "folder", 0), else_=1), direction)


def _matches_kind(node: Node, kind: str | None) -> bool:
    if not kind or kind == "all":
        return True
    if kind == "folder":
        return node.kind == "folder"
    if kind == "document":
        return node.kind == "file" and not node.mime_type.startswith(("image/", "video/", "audio/"))
    return node.kind == "file" and node.mime_type.startswith(f"{kind}/")


@router.get("/nodes", response_model=NodeList)
def list_nodes(
    parent_id: str | None = Query(None),
    search: str | None = Query(None, max_length=200),
    kind: str | None = Query(None),
    favorites: bool = False,
    trashed: bool = False,
    recent: bool = False,
    sort: str = Query("name"),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Node).where(Node.owner_id == user.id)
    stmt = stmt.where(Node.deleted_at.is_not(None)) if trashed else stmt.where(Node.deleted_at.is_(None))

    folder = None
    if search:
        stmt = stmt.where(Node.name.ilike(f"%{search.strip()}%"))
    elif favorites:
        stmt = stmt.where(Node.is_favorite.is_(True))
    elif recent:
        stmt = stmt.order_by(Node.created_at.desc())
    elif not trashed:
        folder = get_folder(db, user, parent_id)
        stmt = stmt.where(Node.parent_id.is_(None) if folder is None else Node.parent_id == folder.id)

    if recent:
        items = list(db.scalars(stmt.limit(limit)).all())
    else:
        items = list(db.scalars(stmt.order_by(*_sort_clause(sort)).limit(limit)).all())

    if trashed:
        parent_ids = {item.parent_id for item in items if item.parent_id}
        parents = {
            row.id: row.deleted_at
            for row in db.scalars(select(Node).where(Node.id.in_(parent_ids))).all()
        } if parent_ids else {}
        items = [item for item in items if not item.parent_id or parents.get(item.parent_id) is None]
        items.sort(key=lambda node: node.deleted_at or node.created_at, reverse=True)

    if kind:
        items = [item for item in items if _matches_kind(item, kind)]

    trail: list[Breadcrumb] = (
        [] if (search or favorites or trashed or recent) else breadcrumb(db, folder.id if folder else None)
    )
    return NodeList(items=serialize_nodes(db, items, user.id), breadcrumb=trail, total=len(items))


def _ensure_path(db: Session, user: User, parent: Node | None, parts: list[str]) -> Node | None:
    current = parent
    for part in parts:
        name = sanitize_name(part)
        if not name:
            continue
        query = select(Node).where(
            Node.owner_id == user.id,
            Node.kind == "folder",
            Node.name == name,
            Node.deleted_at.is_(None),
        )
        query = query.where(Node.parent_id.is_(None)) if current is None else query.where(Node.parent_id == current.id)
        existing = db.scalars(query).first()
        if existing is None:
            existing = Node(
                owner_id=user.id,
                parent_id=current.id if current else None,
                name=unique_name(db, user.id, current.id if current else None, name),
                kind="folder",
            )
            db.add(existing)
            db.flush()
        current = existing
    return current


@router.post("/nodes/upload", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
def upload_file(
    file: UploadFile = File(...),
    parent_id: str | None = Form(None),
    relative_path: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = get_folder(db, user, parent_id)

    raw_name = os.path.basename((relative_path or file.filename or "archivo").replace("\\", "/"))
    name = sanitize_name(raw_name, "archivo")

    if relative_path:
        parts = [part for part in relative_path.replace("\\", "/").split("/")[:-1] if part]
        if parts:
            folder = _ensure_path(db, user, folder, parts)

    declared = getattr(file, "size", None)
    if settings.max_upload_bytes and declared and declared > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="El archivo supera el tamano maximo permitido")
    if user.quota_bytes and declared and used_bytes(db, user.id) + declared > user.quota_bytes:
        raise HTTPException(status_code=413, detail="No tienes espacio suficiente en tu plan")

    storage = get_storage()
    key = new_key(name)
    stored = storage.save(file.file, key)

    if settings.max_upload_bytes and stored.size > settings.max_upload_bytes:
        storage.delete(stored.key)
        raise HTTPException(status_code=413, detail="El archivo supera el tamano maximo permitido")
    if user.quota_bytes and used_bytes(db, user.id) + stored.size > user.quota_bytes:
        storage.delete(stored.key)
        raise HTTPException(status_code=413, detail="No tienes espacio suficiente en tu plan")

    node = Node(
        owner_id=user.id,
        parent_id=folder.id if folder else None,
        name=unique_name(db, user.id, folder.id if folder else None, name),
        kind="file",
        size=stored.size,
        mime_type=guess_mime(name, file.content_type),
        storage_backend=stored.backend,
        storage_key=stored.key,
        checksum=stored.checksum,
    )
    db.add(node)
    db.flush()
    log_activity(db, user, "upload", node, size=stored.size)
    db.commit()
    db.refresh(node)
    return serialize_nodes(db, [node], user.id)[0]


@router.post("/nodes/folder", response_model=NodeOut, status_code=status.HTTP_201_CREATED)
def create_folder(payload: FolderCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    parent = get_folder(db, user, payload.parent_id)
    name = sanitize_name(payload.name, "Carpeta")
    node = Node(
        owner_id=user.id,
        parent_id=parent.id if parent else None,
        name=unique_name(db, user.id, parent.id if parent else None, name),
        kind="folder",
    )
    db.add(node)
    db.flush()
    log_activity(db, user, "folder", node)
    db.commit()
    db.refresh(node)
    return serialize_nodes(db, [node], user.id)[0]


@router.get("/nodes/{node_id}", response_model=NodeOut)
def get_node(node_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    node = get_owned(db, user, node_id)
    return serialize_nodes(db, [node], user.id)[0]


@router.get("/nodes/{node_id}/breadcrumb", response_model=list[Breadcrumb])
def node_breadcrumb(node_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    node = get_owned(db, user, node_id)
    return breadcrumb(db, node.id)


def _content_response(node: Node, inline: bool):
    storage = get_storage()
    if not node.storage_key:
        raise HTTPException(status_code=404, detail="El contenido no esta disponible")

    blocked = inline and node.mime_type.split(";")[0] in INLINE_BLOCKED
    disposition = "inline" if inline and not blocked else "attachment"
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(node.name)}",
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
    }
    if inline and not blocked:
        headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'"

    path = storage.local_path(node.storage_key)
    if path is not None:
        return FileResponse(path, media_type=node.mime_type, headers=headers)

    headers["Content-Length"] = str(node.size)
    return StreamingResponse(storage.read(node.storage_key), media_type=node.mime_type, headers=headers)


def _zip_folder(db: Session, node: Node) -> Path:
    storage = get_storage()
    rows = subtree(db, node.id)
    by_id = {row.id: row for row in rows}

    def rel_path(row: Node) -> str:
        parts = [row.name]
        current = row
        while current.parent_id and current.parent_id in by_id:
            current = by_id[current.parent_id]
            parts.append(current.name)
        return "/".join(reversed(parts))

    handle = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    with zipfile.ZipFile(handle, "w", zipfile.ZIP_STORED, allowZip64=True) as archive:
        for row in rows:
            if row.kind != "file" or not row.storage_key:
                continue
            with archive.open(rel_path(row), "w") as target:
                for chunk in storage.read(row.storage_key):
                    target.write(chunk)
    handle.close()
    return Path(handle.name)


def _remove_temp(path: Path) -> None:
    path.unlink(missing_ok=True)


@router.get("/nodes/{node_id}/download")
def download_node(
    node_id: str,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_media_user),
):
    node = get_owned(db, user, node_id)
    if node.kind == "folder":
        archive = _zip_folder(db, node)
        background.add_task(_remove_temp, archive)
        return FileResponse(
            archive,
            media_type="application/zip",
            filename=f"{node.name}.zip",
            background=background,
        )
    log_activity(db, user, "download", node, size=node.size)
    db.commit()
    return _content_response(node, inline=False)


@router.get("/nodes/{node_id}/raw")
def raw_node(node_id: str, db: Session = Depends(get_db), user: User = Depends(get_media_user)):
    node = get_owned(db, user, node_id)
    if node.kind == "folder":
        raise HTTPException(status_code=400, detail="Las carpetas no se pueden previsualizar")
    return _content_response(node, inline=True)


@router.patch("/nodes/{node_id}", response_model=NodeOut)
def update_node(
    node_id: str,
    payload: NodeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    node = get_owned(db, user, node_id)

    if payload.name is not None:
        clean = sanitize_name(payload.name)
        if clean != node.name:
            node.name = unique_name(db, user.id, node.parent_id, clean)
            node.mime_type = guess_mime(node.name, None) if node.kind == "file" else node.mime_type
            log_activity(db, user, "rename", node)

    if payload.is_favorite is not None:
        node.is_favorite = payload.is_favorite

    if "parent_id" in payload.model_fields_set:
        target = get_folder(db, user, payload.parent_id)
        if target and (target.id == node.id or target.id in child_ids(db, node.id)):
            raise HTTPException(status_code=400, detail="No puedes mover una carpeta dentro de si misma")
        node.parent_id = target.id if target else None
        node.name = unique_name(db, user.id, node.parent_id, node.name)
        log_activity(db, user, "move", node)

    node.updated_at = utcnow()
    db.commit()
    db.refresh(node)
    return serialize_nodes(db, [node], user.id)[0]


@router.delete("/nodes/{node_id}", status_code=status.HTTP_200_OK)
def trash_node(node_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    node = get_owned(db, user, node_id)
    mark_trashed(db, node)
    log_activity(db, user, "trash", node)
    db.commit()
    return {"ok": True, "trash_id": node.trash_id}


@router.post("/nodes/{node_id}/restore", response_model=NodeOut)
def restore_node(node_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    node = get_owned(db, user, node_id, allow_deleted=True)
    if node.deleted_at is None:
        return serialize_nodes(db, [node], user.id)[0]

    ids = [node.id, *child_ids(db, node.id)]
    for row in db.scalars(select(Node).where(Node.id.in_(ids))).all():
        row.deleted_at = None
        row.trash_id = None

    if node.parent_id:
        parent = db.get(Node, node.parent_id)
        if parent is None or parent.deleted_at is not None:
            node.parent_id = None
    node.name = unique_name(db, user.id, node.parent_id, node.name)
    log_activity(db, user, "restore", node)
    db.commit()
    db.refresh(node)
    return serialize_nodes(db, [node], user.id)[0]


def _purge(db: Session, user: User, roots: list[Node]) -> int:
    storage = get_storage()
    removed = 0
    for root in roots:
        ids = [root.id, *child_ids(db, root.id)]
        for row in db.scalars(select(Node).where(Node.id.in_(ids))).all():
            if row.storage_key:
                try:
                    storage.delete(row.storage_key)
                except Exception:
                    pass
            removed += 1
        db.execute(delete(Share).where(Share.node_id.in_(ids)))
        db.execute(delete(Node).where(Node.id.in_(ids)))
    return removed


@router.delete("/nodes/{node_id}/permanent")
def purge_node(node_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    node = get_owned(db, user, node_id, allow_deleted=True)
    name = node.name
    removed = _purge(db, user, [node])
    log_activity(db, user, "purge", name=name)
    db.commit()
    return {"ok": True, "removed": removed}


@router.post("/trash/empty")
def empty_trash(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    roots = list(
        db.scalars(
            select(Node).where(Node.owner_id == user.id, Node.deleted_at.is_not(None), Node.parent_id.is_(None))
        ).all()
    )
    orphans = list(
        db.scalars(select(Node).where(Node.owner_id == user.id, Node.deleted_at.is_not(None))).all()
    )
    candidates = {row.id: row for row in orphans}
    top_level = [row for row in orphans if not row.parent_id or row.parent_id not in candidates]
    removed = _purge(db, user, top_level or roots)
    log_activity(db, user, "empty_trash", name="Papelera")
    db.commit()
    return {"ok": True, "removed": removed}


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    live = (Node.owner_id == user.id, Node.deleted_at.is_(None))
    files = int(db.scalar(select(func.count(Node.id)).where(*live, Node.kind == "file")) or 0)
    folders = int(db.scalar(select(func.count(Node.id)).where(*live, Node.kind == "folder")) or 0)
    favorites = int(db.scalar(select(func.count(Node.id)).where(*live, Node.is_favorite.is_(True))) or 0)
    trashed = db.scalars(select(Node).where(Node.owner_id == user.id, Node.deleted_at.is_not(None))).all()
    trash_size = sum(row.size for row in trashed if row.kind == "file")
    shared = int(db.scalar(select(func.count(Share.id)).where(Share.owner_id == user.id)) or 0)

    by_type: list[TypeUsage] = []
    file_rows = db.scalars(select(Node).where(*live, Node.kind == "file")).all()
    for label, prefixes in TYPE_GROUPS.items():
        matched = [row for row in file_rows if row.mime_type.startswith(prefixes)]
        if matched:
            by_type.append(
                TypeUsage(label=label, size=sum(row.size for row in matched), count=len(matched))
            )

    activity = list(
        db.scalars(
            select(Activity).where(Activity.user_id == user.id).order_by(Activity.created_at.desc()).limit(12)
        ).all()
    )

    return StatsOut(
        used=used_bytes(db, user.id),
        quota=user.quota_bytes,
        files=files,
        folders=folders,
        trash_size=trash_size,
        trash_count=len(trashed),
        favorites=favorites,
        shared=shared,
        by_type=by_type,
        activity=[ActivityOut.model_validate(row) for row in activity],
    )


@router.get("/activity", response_model=list[ActivityOut])
def activity(
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.scalars(
        select(Activity).where(Activity.user_id == user.id).order_by(Activity.created_at.desc()).limit(limit)
    ).all()
    return [ActivityOut.model_validate(row) for row in rows]
