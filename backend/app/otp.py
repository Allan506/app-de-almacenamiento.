from __future__ import annotations

import asyncio
import logging
import secrets
import smtplib
import ssl
import threading
import time
from datetime import timedelta
from email.message import EmailMessage

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import OtpCode, utcnow
from .security import hash_code

logger = logging.getLogger("nube.otp")
settings = get_settings()

_lock = threading.Lock()
_buckets: dict[str, list[float]] = {}


def _consume(key: str, limit: int, window: int) -> int:
    """Sliding-window limiter. Returns seconds to wait, or 0 when allowed."""
    now = time.time()
    with _lock:
        hits = [stamp for stamp in _buckets.get(key, []) if now - stamp < window]
        if len(hits) >= limit:
            _buckets[key] = hits
            return max(1, int(window - (now - hits[0])) + 1)
        hits.append(now)
        _buckets[key] = hits
    return 0


def generate_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(settings.otp_length))


async def deliver_code(email: str, code: str, channel: str) -> None:
    if channel == "telegram":
        await _send_telegram(email, code)
    elif channel == "email":
        await asyncio.to_thread(_send_email, email, code)
    else:
        logger.warning("OTP para %s: %s (canal consola)", email, code)


def _send_email(email: str, code: str) -> None:
    if not settings.smtp_host or not settings.smtp_from:
        raise RuntimeError("SMTP no configurado")

    message = EmailMessage()
    message["Subject"] = f"Tu codigo de acceso: {code}"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(
        f"Tu codigo de verificacion es {code}.\n\nCaduca en {settings.otp_ttl_seconds // 60} minutos.\n"
        "Si no solicitaste este codigo, ignora este mensaje."
    )
    message.add_alternative(
        f"""\
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#0b1020;padding:40px">
  <div style="max-width:520px;margin:0 auto;background:#131a2f;border:1px solid #24304d;border-radius:18px;padding:36px;color:#e8ecf7">
    <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#8b9ac4">{settings.app_name}</div>
    <h1 style="font-size:22px;margin:16px 0 8px">Tu codigo de acceso</h1>
    <p style="color:#a8b3d1;line-height:1.6;margin:0 0 24px">
      Usa este codigo para iniciar sesion. Caduca en {settings.otp_ttl_seconds // 60} minutos y solo puede usarse una vez.
    </p>
    <div style="font-size:38px;font-weight:700;letter-spacing:.32em;background:#0b1020;border-radius:14px;padding:18px;text-align:center;color:#ffffff">
      {code}
    </div>
    <p style="color:#6f7da3;font-size:12px;margin-top:24px">Si no solicitaste este codigo, puedes ignorar este mensaje.</p>
  </div>
</div>""",
        subtype="html",
    )

    context = ssl.create_default_context()
    if settings.smtp_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=20) as server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password or "")
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            server.starttls(context=context)
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password or "")
            server.send_message(message)


async def _send_telegram(email: str, code: str) -> None:
    text = (
        f"<b>{settings.app_name}</b>\n\n"
        f"Codigo para <code>{email}</code>:\n"
        f"<b>{code}</b>\n\n"
        f"Caduca en {settings.otp_ttl_seconds // 60} minutos."
    )
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            json={"chat_id": settings.telegram_chat_id, "text": text, "parse_mode": "HTML"},
        )
    if response.status_code != 200:
        raise RuntimeError(f"Telegram rechazo el envio: {response.text[:200]}")


class OtpError(Exception):
    def __init__(self, message: str, status_code: int = 400, retry_after: int = 0) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after


async def issue_code(db: Session, email: str, ip: str | None) -> tuple[str, int, str]:
    """Create and deliver a fresh OTP. Returns (channel, resend_after, code)."""
    email = email.lower().strip()

    last = db.scalars(
        select(OtpCode).where(OtpCode.email == email).order_by(OtpCode.created_at.desc()).limit(1)
    ).first()
    if last is not None:
        elapsed = (utcnow() - last.created_at).total_seconds()
        if elapsed < settings.otp_resend_cooldown:
            wait = int(settings.otp_resend_cooldown - elapsed) + 1
            raise OtpError(f"Espera {wait}s antes de pedir otro codigo.", 429, wait)

    wait = _consume(f"otp:email:{email}", settings.otp_max_per_hour, 3600)
    if wait:
        raise OtpError("Demasiadas solicitudes para este correo. Intentalo mas tarde.", 429, wait)
    if ip:
        wait = _consume(f"otp:ip:{ip}", settings.otp_max_per_hour * 3, 3600)
        if wait:
            raise OtpError("Demasiadas solicitudes desde esta conexion. Intentalo mas tarde.", 429, wait)

    db.execute(delete(OtpCode).where(OtpCode.email == email, OtpCode.consumed_at.is_(None)))

    channel = settings.resolved_channel
    code = generate_code()
    record = OtpCode(
        email=email,
        code_hash=hash_code(email, code),
        channel=channel,
        expires_at=utcnow() + timedelta(seconds=settings.otp_ttl_seconds),
        ip=ip,
    )
    db.add(record)
    db.commit()

    try:
        await deliver_code(email, code, channel)
    except Exception as exc:  # delivery failure must not leave a usable silent code
        logger.exception("No se pudo entregar el codigo OTP a %s", email)
        db.delete(record)
        db.commit()
        raise OtpError(f"No se pudo enviar el codigo por {channel}. Revisa la configuracion.", 502) from exc

    return channel, settings.otp_resend_cooldown, code


def check_code(db: Session, email: str, code: str) -> OtpCode:
    email = email.lower().strip()
    code = code.strip().replace(" ", "")

    wait = _consume(f"otp:verify:{email}", 12, 600)
    if wait:
        raise OtpError("Demasiados intentos. Espera unos minutos.", 429, wait)

    record = db.scalars(
        select(OtpCode)
        .where(OtpCode.email == email, OtpCode.consumed_at.is_(None))
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    ).first()
    if record is None:
        raise OtpError("Solicita un codigo nuevo.", 400)

    if record.expires_at < utcnow():
        raise OtpError("El codigo ha caducado. Solicita uno nuevo.", 400)

    if record.attempts >= settings.otp_max_attempts:
        raise OtpError("Superaste el numero de intentos. Solicita un codigo nuevo.", 429)

    if not secrets.compare_digest(record.code_hash, hash_code(email, code)):
        record.attempts += 1
        db.commit()
        remaining = settings.otp_max_attempts - record.attempts
        raise OtpError(f"Codigo incorrecto. Intentos restantes: {max(remaining, 0)}.", 401)

    record.consumed_at = utcnow()
    db.commit()
    return record
