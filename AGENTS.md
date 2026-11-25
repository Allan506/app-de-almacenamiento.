# AGENTS.md

Guia para agentes que trabajen en este repositorio.

## Que es

Nube: almacenamiento en la nube con acceso por OTP. Monorepo simple:

- `backend/` API FastAPI + SQLAlchemy (sirve tambien el frontend compilado desde `frontend/dist`).
- `frontend/` React 18 + TypeScript + Vite + Tailwind.

## Comandos

```bash
# Entorno Python (raiz del repo)
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements-dev.txt

# Pruebas de API (rapidas, sin red)
cd backend && python -m pytest -q

# Servidor de desarrollo (API + UI compilada) en http://localhost:12000
cd backend && uvicorn app.main:app --reload --port 12000

# Frontend en modo desarrollo (proxy /api -> :12000)
cd frontend && npm install && npm run dev

# Compilar la interfaz (necesario para que la API la sirva)
cd frontend && npm run build
```

Variables de entorno: ver `backend/.env.example`. En desarrollo conviene `OTP_DEV_MODE=true`
para que el codigo OTP aparezca en la interfaz.

## Convenciones

- Textos de interfaz y mensajes de error en espanol, sin tildes en el codigo fuente.
- Backend: rutas bajo `/api`, respuestas con esquemas Pydantic de `app/schemas.py`,
  toda operacion sobre nodos valida propiedad con `get_owned`/`get_folder`.
- Logica de almacenamiento detras de `app/storage` (`local` y `telegram`); nunca
  escribir archivos directamente desde los routers.
- Frontend: componentes funcionales con TypeScript estricto, clases utilitarias de
  Tailwind (`field`, `btn-primary`, `btn-ghost`, `btn-danger`, `chip`, `icon-btn`,
  `card`, `skeleton` definidas en `src/index.css`). Toda llamada a la API pasa por
  `src/lib/api.ts`.
- Tipos con scripts (HTML, SVG, XML) se sirven como descarga: mantener `INLINE_BLOCKED`.

## Trampas conocidas

- `app/config.py` calcula `BASE_DIR` subiendo tres niveles: mover archivos de sitio rompe
  las rutas de `data/` y `frontend/dist`.
- El backend necesita `frontend/dist` para servir la SPA; sin el build, `/` devuelve 404.
- SQLite no admite `ALTER` complejos: los cambios de esquema requieren recrear la base
  (los modelos viven en `app/models.py` y se crean en `init_db`).
- Los tests fijan variables de entorno antes de importar `app.main` (ver
  `backend/tests/conftest.py`); cualquier modulo que lea ajustes al importar debe
  respetar ese orden.
