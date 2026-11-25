# Nube

Almacenamiento en la nube personal con acceso sin contrasenas: entras con un **codigo OTP** enviado a tu correo (o a Telegram) y ya puedes subir, organizar y compartir archivos **sin cuotas artificiales**.

Aplicacion completa (backend + frontend) lista para ejecutar en local, en un VPS o con Docker.

![Pantalla de acceso](docs/screenshots/login.png)

## Caracteristicas

**Acceso**
- Registro e inicio de sesion con codigo de un solo uso (OTP de 6 digitos, 10 minutos de validez).
- Envio por SMTP, por Telegram o modo consola para desarrollo.
- Limite de intentos, cooldown de reenvio y tope de solicitudes por hora y por IP.
- Token de sesion JWT; cada cierre de sesion invalida los tokens anteriores.

**Archivos y carpetas**
- Subida multiple, subida de carpetas completas conservando la estructura y arrastrar y soltar.
- Carpetas anidadas, breadcrumb, renombrar, mover, favoritos, busqueda global y filtros por tipo.
- Papelera con restauracion y vaciado; los elementos borrados no cuentan para el uso.
- Descarga individual y descarga de carpetas completas en `.zip` generado al vuelo.
- Vista previa integrada de imagenes, video, audio, PDF y texto plano.
- Nombres duplicados resueltos automaticamente (`informe (2).pdf`).

**Compartir**
- Enlaces publicos por archivo o carpeta, con contrasena opcional, caducidad y control de descargas.
- Pagina publica con vista previa, contador de descargas y desbloqueo por contrasena.
- Revocacion inmediata del enlace.

**Almacenamiento**
- Backend local (disco) o **Telegram** como almacenamiento sin limite practico, con troceado automatico de archivos grandes.
- Cuota por usuario opcional (`0` = ilimitado) y limite de tamano por subida.
- Panel de uso: espacio, distribucion por tipo, papelera y actividad reciente.

**Interfaz**
- React + TypeScript + Tailwind, diseno oscuro, responsive y con soporte de teclado.
- Estados de carga, toasts, dialogos de confirmacion y panel de progreso de subidas.

![Mi unidad](docs/screenshots/drive.png)

## Stack

| Capa | Tecnologia |
| --- | --- |
| API | FastAPI, SQLAlchemy 2, SQLite o PostgreSQL |
| Autenticacion | OTP + JWT (PyJWT) |
| Almacenamiento | Disco local o Telegram Bot API |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| Pruebas | pytest + TestClient (24 pruebas de API) |

## Inicio rapido

Requisitos: Python 3.11+ y Node.js 18+.

```bash
git clone https://github.com/Allan506/app-de-almacenamiento.git
cd app-de-almacenamiento

# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env      # ajusta SMTP o Telegram

# Frontend
cd frontend && npm install && npm run build && cd ..

# Arrancar (sirve API + interfaz en el mismo puerto)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 12000
```

Abre `http://localhost:12000`, escribe tu correo y usa el codigo que aparece en pantalla (modo desarrollo) o el que recibas por correo/Telegram.

### Desarrollo con recarga en caliente

```bash
# Terminal 1
cd backend && uvicorn app.main:app --reload --port 12000

# Terminal 2 (Vite con proxy a la API)
cd frontend && npm run dev
```

## Configuracion

Todo se controla con variables de entorno (o un archivo `backend/.env`). Las mas importantes:

| Variable | Por defecto | Descripcion |
| --- | --- | --- |
| `APP_URL` | `http://localhost:12000` | URL publica; se usa para construir los enlaces compartidos |
| `SECRET_KEY` | generada | Clave para firmar JWT (se guarda en `data/.secret` si no se define) |
| `DATA_DIR` | `./data` | Base de datos, archivos y secreto |
| `DATABASE_URL` | SQLite en `DATA_DIR` | Cadena SQLAlchemy alternativa (PostgreSQL, etc.) |
| `STORAGE_BACKEND` | `local` | `local` o `telegram` |
| `OTP_CHANNEL` | `auto` | `auto`, `email`, `telegram` o `console` |
| `OTP_DEV_MODE` | auto | Muestra el codigo en la interfaz (solo desarrollo) |
| `DEFAULT_QUOTA_BYTES` | `0` | Cuota por usuario; `0` = ilimitado |
| `MAX_UPLOAD_BYTES` | `0` | Tamano maximo por archivo; `0` = ilimitado |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SSL` | - | Envio de codigos por correo |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | - | Envio de codigos y almacenamiento en Telegram |
| `TELEGRAM_CHUNK_BYTES` | 19 MB | Trozo maximo por mensaje (sube el limite con un Bot API local) |
| `CORS_ORIGINS` | `*` | Origenes permitidos, separados por comas |

### Correo (SMTP)

```env
OTP_CHANNEL=email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SSL=true
SMTP_USER=tu-cuenta@gmail.com
SMTP_PASSWORD=clave-de-aplicacion
SMTP_FROM=Nube <tu-cuenta@gmail.com>
```

### Telegram como almacenamiento ilimitado

1. Crea un bot con [@BotFather](https://t.me/BotFather) y guarda el token.
2. Escribe al bot y obten tu `chat_id` (por ejemplo con `https://api.telegram.org/bot<TOKEN>/getUpdates`).
3. Configura:

```env
STORAGE_BACKEND=telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789
```

Los archivos se guardan troceados en el chat; la API los reensambla al descargar. La Bot API limita cada archivo a 20 MB, por eso se trocea en partes de 19 MB (`TELEGRAM_CHUNK_BYTES`).

## Docker

```bash
cp backend/.env.example .env    # edita APP_URL y credenciales
docker compose up -d --build
```

El servicio expone el puerto `8000` (o `$PORT` si esta definido) y persiste datos en `./data`.

## Desplegar en Render (24/7, gratis)

El repo incluye `render.yaml`, un blueprint listo para el plan gratuito de Render. Como ese plan no
tiene disco persistente, la configuracion usa Postgres externo (Neon) para la base de datos y
Telegram para el contenido de los archivos:

1. Crea una base gratis en [Neon](https://neon.tech) y copia su `DATABASE_URL`.
2. Crea un bot con [@BotFather](https://t.me/BotFather) y obten tu `chat_id`.
3. En Render: **New → Blueprint** → elige este repo → **Apply**.
4. Rellena `DATABASE_URL`, `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.

Guia detallada, alternativas (Render Starter con disco, VPS) y solucion de problemas:
[`docs/deploy-render.md`](docs/deploy-render.md).

## Pruebas

```bash
pip install -r backend/requirements-dev.txt
cd backend && python -m pytest -q
```

Cubren autenticacion OTP, subida y descarga byte a byte, carpetas, papelera, busqueda, cuotas, enlaces publicos con y sin contrasena, expiracion, aislamiento entre usuarios y borrado de cuenta. La suite pasa igual en SQLite y en PostgreSQL:

```bash
DATABASE_URL=postgresql://usuario:clave@localhost:5432/nube_test python -m pytest -q
```

## API

Documentacion interactiva en `/docs` (Swagger) y `/redoc`.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| `POST` | `/api/auth/otp/request` | Solicita un codigo para un correo |
| `POST` | `/api/auth/otp/verify` | Verifica el codigo y devuelve el token |
| `GET` | `/api/auth/me` | Perfil del usuario |
| `POST` | `/api/auth/media-token` | Token corto para URLs de vista previa y descarga |
| `GET` | `/api/nodes` | Lista por carpeta, busqueda, filtros, recientes, favoritos, papelera |
| `POST` | `/api/nodes/upload` | Sube un archivo (multipart) |
| `POST` | `/api/nodes/folder` | Crea una carpeta |
| `PATCH` | `/api/nodes/{id}` | Renombra, mueve o marca favorito |
| `DELETE` | `/api/nodes/{id}` | Mueve a la papelera |
| `POST` | `/api/nodes/{id}/restore` | Restaura de la papelera |
| `DELETE` | `/api/nodes/{id}/permanent` | Borra definitivamente |
| `GET` | `/api/nodes/{id}/download` | Descarga archivo o carpeta en zip |
| `POST` | `/api/shares` | Crea un enlace publico |
| `GET` | `/api/public/shares/{token}` | Informacion publica del enlace |
| `POST` | `/api/public/shares/{token}/unlock` | Desbloquea enlaces con contrasena |
| `GET` | `/api/public/shares/{token}/download` | Descarga publica |
| `GET` | `/api/stats` | Uso, distribucion por tipo y actividad |

## Seguridad

- Codigos OTP de un solo uso, con hash en base de datos, caducidad y limite de intentos.
- Tokens JWT firmados; `POST /api/auth/logout` invalida los tokens emitidos antes.
- Todas las rutas de archivos comprueban la propiedad del recurso.
- Los tipos que pueden ejecutar scripts (HTML, SVG, XML) se sirven siempre como descarga.
- Contrasenas de enlaces publicos almacenadas con hash.
- Configura `APP_URL`, `SECRET_KEY` y credenciales reales antes de exponer el servicio.

## Estructura

```
backend/
  app/
    config.py      Ajustes y rutas de datos
    database.py    Motor SQLAlchemy y sesiones
    models.py      User, Node, Share, Activity
    otp.py         Emision y verificacion de codigos
    storage/       Backends local y Telegram
    routers/       auth, nodes, shares (+ endpoints publicos)
  tests/           Suite de API con pytest
frontend/
  src/
    components/    Sidebar, Topbar, FileItem, modales, panel de subidas
    context/       Sesion y notificaciones
    pages/         Login, Drive, pagina publica de enlace
    lib/           Cliente de API y utilidades de formato
```

## Licencia

MIT
