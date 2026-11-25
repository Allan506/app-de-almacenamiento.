from __future__ import annotations

import io
import json
import logging
from collections.abc import Iterator
from typing import BinaryIO
from pathlib import Path

import httpx

from .base import HashingReader, StoredObject

logger = logging.getLogger("nube.storage.telegram")
API = "https://api.telegram.org"


class TelegramStorage:
    """Unlimited, zero-cost object storage on top of a Telegram chat.

    Files are split into chunks below the Bot API limits, uploaded as documents
    and re-assembled on download.
    """

    name = "telegram"

    def __init__(self, token: str, chat_id: str, chunk_bytes: int) -> None:
        self.token = token
        self.chat_id = chat_id
        self.chunk_bytes = chunk_bytes
        self.client = httpx.Client(timeout=120)

    def _read_exact(self, reader: HashingReader, size: int) -> bytes:
        buffer = bytearray()
        while len(buffer) < size:
            chunk = reader.read(size - len(buffer))
            if not chunk:
                break
            buffer.extend(chunk)
        return bytes(buffer)

    def _upload(self, data: bytes, filename: str) -> tuple[str, int]:
        response = self.client.post(
            f"{API}/bot{self.token}/sendDocument",
            data={"chat_id": self.chat_id, "caption": f"nube:{filename}"[:1000]},
            files={"document": (filename, io.BytesIO(data), "application/octet-stream")},
        )
        if response.status_code != 200:
            raise RuntimeError(f"Telegram upload failed: {response.text[:300]}")
        document = response.json()["result"]["document"]
        return document["file_id"], response.json()["result"]["message_id"]

    def save(self, stream: BinaryIO, key: str) -> StoredObject:
        reader = HashingReader(stream)
        chunks: list[dict] = []
        index = 0
        while True:
            data = self._read_exact(reader, self.chunk_bytes)
            if not data:
                break
            file_id, message_id = self._upload(data, f"{key.replace('/', '_')}.{index:04d}")
            chunks.append({"file_id": file_id, "message_id": message_id, "size": len(data)})
            index += 1
        if not chunks:
            file_id, message_id = self._upload(b"", f"{key.replace('/', '_')}.0000")
            chunks.append({"file_id": file_id, "message_id": message_id, "size": 0})
        return StoredObject(self.name, json.dumps({"chunks": chunks}), reader.size, reader.checksum)

    def _chunk_stream(self, file_id: str) -> Iterator[bytes]:
        info = self.client.post(f"{API}/bot{self.token}/getFile", data={"file_id": file_id})
        if info.status_code != 200:
            raise RuntimeError(f"Telegram getFile failed: {info.text[:200]}")
        file_path = info.json()["result"]["file_path"]
        with self.client.stream("GET", f"{API}/file/bot{self.token}/{file_path}") as response:
            response.raise_for_status()
            for block in response.iter_bytes(256 * 1024):
                yield block

    def read(self, key: str) -> Iterator[bytes]:
        payload = json.loads(key)
        for chunk in payload.get("chunks", []):
            yield from self._chunk_stream(chunk["file_id"])

    def delete(self, key: str) -> None:
        try:
            payload = json.loads(key)
        except (TypeError, ValueError):
            return
        for chunk in payload.get("chunks", []):
            message_id = chunk.get("message_id")
            if message_id:
                try:
                    self.client.post(
                        f"{API}/bot{self.token}/deleteMessage",
                        data={"chat_id": self.chat_id, "message_id": message_id},
                    )
                except httpx.HTTPError:
                    logger.warning("No se pudo borrar el mensaje %s de Telegram", message_id)

    def local_path(self, key: str) -> Path | None:
        return None
