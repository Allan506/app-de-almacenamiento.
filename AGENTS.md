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
- Nube Lite (`site/`) es solo frontend: el "disco" es un chat de Telegram y el indice vive en
  IndexedDB. Las llamadas sin archivo van como `application/x-www-form-urlencoded` (Telegram
  responde 400 a un `multipart/form-data` vacio).
- Comportamiento movil en `site/src/lib`: `zoom.ts` (viewport, `touch-action`, gestos de Safari) y
  `backstack.ts` (tapon de historial que consume el atras por capas; solo en tactil o PWA). Los
  componentes registran su capa con `useBackHandler(handler, prioridad)`; prioridad mayor se
  consume antes.

## Trampas conocidas

- `app/config.py` calcula `BASE_DIR` subiendo tres niveles: mover archivos de sitio rompe
  las rutas de `data/` y `frontend/dist`.
- El backend necesita `frontend/dist` para servir la SPA; sin el build, `/` devuelve 404.
- SQLite no admite `ALTER` complejos: los cambios de esquema requieren recrear la base
  (los modelos viven en `app/models.py` y se crean en `init_db`).
- Los tests fijan variables de entorno antes de importar `app.main` (ver
  `backend/tests/conftest.py`); cualquier modulo que lea ajustes al importar debe
  respetar ese orden. La suite debe pasar en SQLite y en PostgreSQL:
  `DATABASE_URL=postgresql://user:pass@localhost:5432/nube_test pytest -q`.
- `app/database.py` distingue SQLite (hilos) de Postgres (pool reciclado); no mezclar
  `connect_args` de SQLite con un DSN de Postgres.
- La suite del sitio (`cd site && npm test`) cubre troceado, transporte, arbol, zip, backstack y zoom.
- Despliegue: `render.yaml` (Render free + Neon + Telegram) y `docs/deploy-render.md`.
  En Render el contenedor escucha en `$PORT` y `APP_URL` se deduce de
  `RENDER_EXTERNAL_URL`; el disco es efimero, no guardar nada solo en `data/`.

## Nube Lite (site/, GitHub Pages)

Edicion sin backend que se publica en GitHub Pages y guarda los archivos en un chat de Telegram.

```bash
cd site && npm ci
npm test        # vitest: troceado, transporte, arbol, zip
npm run dev     # http://localhost:12001
npm run build   # dist/ (base relativa, sin router: funciona en /<repo>/)
```

- `api.telegram.org` y `/file/bot<token>/...` responden con `access-control-allow-origin: *`, por eso el
  navegador puede subir y descargar sin proxy: no hay que anadir un backend a esta edicion.
- La Bot API limita a 20 MB por subida: `TelegramClient.upload` trocea en partes de 19 MB y guarda
  `{file_id, message_id, size}` en `node.chunks`. Nunca cambies el troceado sin probar el reensamblado.
- El indice (nodos, favoritos, papelera) vive en IndexedDB (`VaultDb`), no en el chat. Exportar/importar
  JSON no incluye el token del bot.
- El transporte de Telegram es una interfaz (`TelegramTransport`) para poder probar la orquestacion en
  vitest sin red; los tests E2E se hacen con un Telegram falso via `page.route`.
- `site/` no comparte codigo con `frontend/`: los estilos y tipos estan duplicados a proposito para no
  arrastrar el cliente de API del backend.
- Flujo de entrada: `Landing` (portada) → `Setup` (asistente de 2 pasos) → `Drive`. Si hay config guardada
  se salta la portada. `App.tsx` decide el estado.
- PWA: `public/manifest.webmanifest`, `public/sw.js` e iconos en `public/icons`. El service worker solo
  cachea el armazon (nunca `api.telegram.org`); `initPwa()` en `src/lib/pwa.ts` registra el worker y el
  evento `beforeinstallprompt` que alimenta el boton **Instalar Nube**.
- Despliegue: `.github/workflows/pages.yml` (build + deploy-pages, `enablement: true`). Solo se dispara
  con cambios en `site/`.
