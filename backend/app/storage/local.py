from __future__ import annotations

from collections.abc import Iterator
from typing import BinaryIO
from pathlib import Path

from .base import HashingReader, StoredObject

CHUNK = 1024 * 1024


class LocalStorage:
    name = "local"

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("Clave de almacenamiento invalida")
        return path

    def save(self, stream: BinaryIO, key: str) -> StoredObject:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        reader = HashingReader(stream)
        with path.open("wb") as handle:
            while True:
                chunk = reader.read(CHUNK)
                if not chunk:
                    break
                handle.write(chunk)
        return StoredObject(self.name, key, reader.size, reader.checksum)

    def read(self, key: str) -> Iterator[bytes]:
        with self._resolve(key).open("rb") as handle:
            while True:
                chunk = handle.read(CHUNK)
                if not chunk:
                    break
                yield chunk

    def delete(self, key: str) -> None:
        path = self._resolve(key)
        path.unlink(missing_ok=True)
        parent = path.parent
        while parent != self.root and parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
            parent = parent.parent

    def local_path(self, key: str) -> Path | None:
        path = self._resolve(key)
        return path if path.exists() else None
