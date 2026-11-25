from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from pathlib import Path

from ..config import get_settings
from .base import StorageBackend, StoredObject
from .local import LocalStorage
from .telegram import TelegramStorage

logger = logging.getLogger("nube.storage")

__all__ = ["StorageBackend", "StoredObject", "LocalStorage", "TelegramStorage", "get_storage", "new_key"]


def new_key(filename: str) -> str:
    suffix = Path(filename).suffix.lower()[:16]
    token = uuid.uuid4().hex
    return f"{token[:2]}/{token}{suffix}"


@lru_cache
def get_storage() -> StorageBackend:
    settings = get_settings()
    if settings.storage_backend == "telegram":
        if not (settings.telegram_bot_token and settings.telegram_chat_id):
            logger.warning("STORAGE_BACKEND=telegram sin credenciales; usando disco local")
            return LocalStorage(settings.upload_dir)
        return TelegramStorage(
            settings.telegram_bot_token, settings.telegram_chat_id, settings.telegram_chunk_bytes
        )
    return LocalStorage(settings.upload_dir)
