from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import BASE_DIR, get_settings
from .database import init_db
from .routers import auth, nodes, shares

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("nube")
settings = get_settings()

DIST = BASE_DIR / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Almacenamiento: %s | OTP: %s", settings.storage_backend, settings.resolved_channel)
    if settings.dev_mode:
        logger.warning("Modo desarrollo activo: los codigos OTP se muestran en la interfaz")
    yield


app = FastAPI(
    title=f"{settings.app_name} API",
    description="Almacenamiento en la nube con acceso mediante codigos de un solo uso.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.include_router(auth.router)
app.include_router(nodes.router)
app.include_router(shares.router)
app.include_router(shares.public)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "app": settings.app_name,
        "storage": settings.storage_backend,
        "otp_channel": settings.resolved_channel,
        "dev_mode": settings.dev_mode,
    }


if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Endpoint no encontrado")
    if DIST.exists():
        candidate: Path = DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        index = DIST / "index.html"
        if index.exists():
            return FileResponse(index)
    raise HTTPException(
        status_code=503,
        detail="Frontend no compilado. Ejecuta 'npm run build' en frontend/ o usa el servidor de desarrollo.",
    )
