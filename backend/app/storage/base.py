from __future__ import annotations

import hashlib
from collections.abc import Iterator
from typing import BinaryIO
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass
class StoredObject:
    backend: str
    key: str
    size: int
    checksum: str


class StorageBackend(Protocol):
    name: str

    def save(self, stream: BinaryIO, key: str) -> StoredObject: ...

    def read(self, key: str) -> Iterator[bytes]: ...

    def delete(self, key: str) -> None: ...

    def local_path(self, key: str) -> Path | None: ...


class HashingReader:
    """Wraps a stream and keeps a running SHA-256 of everything read."""

    def __init__(self, stream: BinaryIO) -> None:
        self.stream = stream
        self.hasher = hashlib.sha256()
        self.size = 0

    def read(self, size: int = -1) -> bytes:
        chunk = self.stream.read(size)
        if chunk:
            self.hasher.update(chunk)
            self.size += len(chunk)
        return chunk

    @property
    def checksum(self) -> str:
        return self.hasher.hexdigest()
