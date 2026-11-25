from __future__ import annotations

from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Activity, Node, Share, User, new_id, utcnow
from .schemas import Breadcrumb, NodeOut


def used_bytes(db: Session, user_id: str) -> int:
    total = db.scalar(
        select(func.coalesce(func.sum(Node.size), 0)).where(
            Node.owner_id == user_id, Node.kind == "file", Node.deleted_at.is_(None)
        )
    )
    return int(total or 0)


def log_activity(db: Session, user: User, action: str, node: Node | None = None, name: str = "", size: int = 0) -> None:
    db.add(
        Activity(
            user_id=user.id,
            action=action,
            node_id=node.id if node else None,
            node_name=(node.name if node else name)[:255],
            size=size,
        )
    )


def get_owned(db: Session, user: User, node_id: str, *, allow_deleted: bool = False) -> Node:
    node = db.get(Node, node_id)
    if node is None or node.owner_id != user.id or (node.deleted_at is not None and not allow_deleted):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Elemento no encontrado")
    return node


def get_folder(db: Session, user: User, folder_id: str | None) -> Node | None:
    if folder_id in (None, "", "root"):
        return None
    folder = get_owned(db, user, folder_id)
    if folder.kind != "folder":
        raise HTTPException(status_code=400, detail="El destino no es una carpeta")
    return folder


def child_ids(db: Session, node_id: str) -> list[str]:
    """All descendant node ids (breadth first)."""
    found: list[str] = []
    frontier = [node_id]
    while frontier:
        rows = db.scalars(select(Node.id).where(Node.parent_id.in_(frontier))).all()
        frontier = [row for row in rows if row not in found]
        found.extend(frontier)
    return found


def subtree(db: Session, node_id: str) -> list[Node]:
    ids = child_ids(db, node_id)
    if not ids:
        return []
    return list(db.scalars(select(Node).where(Node.id.in_(ids))))


def breadcrumb(db: Session, folder_id: str | None) -> list[Breadcrumb]:
    trail: list[Breadcrumb] = []
    seen: set[str] = set()
    current = folder_id
    while current and current not in seen:
        seen.add(current)
        node = db.get(Node, current)
        if node is None:
            break
        trail.append(Breadcrumb(id=node.id, name=node.name))
        current = node.parent_id
    trail.reverse()
    return trail


def serialize_nodes(db: Session, nodes: Iterable[Node], user_id: str) -> list[NodeOut]:
    items = list(nodes)
    if not items:
        return []
    shared = set(
        db.scalars(select(Share.node_id).where(Share.node_id.in_([item.id for item in items]))).all()
    )
    result = []
    for item in items:
        payload = NodeOut.model_validate(item)
        payload.has_share = item.id in shared
        result.append(payload)
    return result


def mark_trashed(db: Session, node: Node) -> str:
    trash_id = new_id()
    node.deleted_at = node.updated_at = utcnow()
    node.trash_id = trash_id
    for descendant in subtree(db, node.id):
        if descendant.deleted_at is None:
            descendant.deleted_at = node.deleted_at
            descendant.trash_id = trash_id
    return trash_id
