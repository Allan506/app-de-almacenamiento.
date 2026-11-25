from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Nube"
    app_url: str = "http://localhost:12000"
    data_dir: Path = BASE_DIR / "data"
    database_url: str | None = None

    secret_key: str | None = None
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30

    # OTP
    otp_length: int = 6
    otp_ttl_seconds: int = 600
    otp_max_attempts: int = 5
    otp_resend_cooldown: int = 30
    otp_max_per_hour: int = 10
    otp_channel: Literal["auto", "email", "telegram", "console"] = "auto"
    otp_dev_mode: bool | None = None

    # Email delivery
    smtp_host: str | None = None
    smtp_port: int = 465
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_ssl: bool = True

    # Telegram (OTP delivery + unlimited storage backend)
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None

    # Storage
    storage_backend: Literal["local", "telegram"] = "local"
    default_quota_bytes: int = 0  # 0 = unlimited
    max_upload_bytes: int = 0  # 0 = unlimited
    # Bot API caps downloads at 20 MB per file; raise it when using a local Bot API server.
    telegram_chunk_bytes: int = 19 * 1024 * 1024

    cors_origins: str = "*"

    @property
    def resolved_data_dir(self) -> Path:
        path = Path(self.data_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{self.resolved_data_dir / 'nube.db'}"

    @property
    def resolved_secret(self) -> str:
        if self.secret_key:
            return self.secret_key
        path = self.resolved_data_dir / ".secret"
        if path.exists():
            return path.read_text(encoding="utf-8").strip()
        value = secrets.token_urlsafe(48)
        path.write_text(value, encoding="utf-8")
        path.chmod(0o600)
        return value

    @property
    def upload_dir(self) -> Path:
        path = self.resolved_data_dir / "uploads"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def resolved_channel(self) -> str:
        if self.otp_channel != "auto":
            return self.otp_channel
        if self.telegram_bot_token and self.telegram_chat_id:
            return "telegram"
        if self.smtp_host and self.smtp_from:
            return "email"
        return "console"

    @property
    def dev_mode(self) -> bool:
        if self.otp_dev_mode is not None:
            return self.otp_dev_mode
        return self.resolved_channel == "console"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
