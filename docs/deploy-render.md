# Desplegar Nube en Render

Guia para tener la aplicacion publicada 24/7 en [Render](https://render.com) con plan gratuito.

## Antes de empezar: por que hacen falta dos servicios externos

El plan free de Render **no tiene disco persistente**: cada despliegue o reinicio arranca con el
sistema de archivos vacio. Nube guarda dos cosas que deben sobrevivir:

| Que | Donde va en Render free |
| --- | --- |
| Base de datos (usuarios, arbol de archivos, enlaces) | Postgres externo gratis de [Neon](https://neon.tech) |
| Contenido de los archivos | Chat de Telegram (backend `telegram`) |

Con esas dos piezas la instancia puede reiniciarse sin perder nada.

## 1. Base de datos en Neon (5 minutos)

1. Crea una cuenta en https://neon.tech y un proyecto (region `eu-central-1` si estas en Europa).
2. Copia la cadena de conexion, que tiene esta forma:

```
postgresql://usuario:clave@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

3. No hace falta crear tablas: la aplicacion las crea sola al arrancar.

## 2. Bot de Telegram (3 minutos)

1. Habla con [@BotFather](https://t.me/BotFather), envia `/newbot` y guarda el **token**.
2. Abre un chat con tu bot y mandale cualquier mensaje (asi el bot puede responderte).
3. Obten tu `chat_id`:

```bash
curl -s "https://api.telegram.org/bot<TU_TOKEN>/getUpdates" | grep -o '"chat":{"id":[-0-9]*'
```

El numero que aparece (puede ser negativo si es un grupo) es el `TELEGRAM_CHAT_ID`.

> Este chat se usa para dos cosas: enviarte los codigos OTP y guardar los archivos troceados.
> Si prefieres recibir los codigos por correo, configura `SMTP_*` y pon `OTP_CHANNEL=email`.

## 3. Desplegar en Render

1. Entra en https://dashboard.render.com → **New → Blueprint**.
2. Conecta tu cuenta de GitHub y elige el repo `app-de-almacenamiento`.
3. Render lee `render.yaml` y muestra el servicio `nube`. Pulsa **Apply**.
4. Rellena las variables que el blueprint deja pendientes (`sync: false`):
   - `DATABASE_URL` → la cadena de Neon del paso 1.
   - `TELEGRAM_BOT_TOKEN` → el token de BotFather.
   - `TELEGRAM_CHAT_ID` → el id del paso 2.
5. Espera el primer build (5-8 minutos: compila el frontend y la imagen Docker).
6. Cuando el estado sea **Live**, abre la URL `https://nube-xxxx.onrender.com/api/health` y
   comprueba:

```json
{"status":"ok","app":"Nube","storage":"telegram","otp_channel":"telegram","dev_mode":false}
```

`APP_URL` no hace falta configurarla: la aplicacion toma `RENDER_EXTERNAL_URL` automaticamente
para construir los enlaces de compartir.

## 4. Verificar

1. Abre `https://nube-xxxx.onrender.com`, escribe tu correo y pide el codigo.
2. Debe llegarte por Telegram (o por correo si configuraste SMTP).
3. Entra, sube un archivo, crea un enlace publico y abrilo en el movil.
4. Fuerza un redeploy en Render (**Manual Deploy → Deploy latest commit**) y comprueba que el
   archivo sigue ahi: es la prueba de que Postgres y Telegram estan haciendo su trabajo.

## 5. Evitar que se duerma

El plan free suspende la instancia tras 15 minutos sin trafico; la siguiente visita tarda unos
30 segundos en responder. Para que este siempre caliente, crea un monitor gratuito:

- [UptimeRobot](https://uptimerobot.com) o [cron-job.org](https://cron-job.org)
- URL: `https://nube-xxxx.onrender.com/api/health`
- Intervalo: cada 10 minutos

Ten en cuenta las horas de instancia gratuitas de Render (750 h/mes por cuenta); un solo servicio
encendido todo el mes consume ~730 h.

## Alternativa de pago (mas simple)

Si prefieres olvidarte de Neon y Telegram: sube el plan a **Starter** (7 $/mes) y añade un disco
en el dashboard (**Disks → Add Disk**, 1 GB, punto de montaje `/app/data`). Despues:

- `STORAGE_BACKEND=local`
- Sin `DATABASE_URL` (la base SQLite vive en el disco)

Todo queda en un unico servicio y los archivos no salen de Render.

## Problemas frecuentes

| Sintoma | Causa / solucion |
| --- | --- |
| El build falla en `npm ci` | `frontend/package-lock.json` debe estar en el repo (lo esta). Revisa el log del paso `web`. |
| `Live` pero 502 | La app escucha en `$PORT`; el `Dockerfile` ya lo respeta. Revisa los logs del servicio. |
| Los codigos no llegan | `OTP_CHANNEL=telegram` exige token y chat_id validos; el bot debe haber recibido un mensaje tuyo antes. |
| Los archivos desaparecen tras un redeploy | Falta `DATABASE_URL` o `STORAGE_BACKEND=telegram`, o el disco no esta montado en `/app/data`. |
| `connection refused` a Neon | Usa la cadena con `?sslmode=require` y la region mas cercana al servicio de Render. |
| La primera peticion tarda 2-3 s | Neon suspende el compute por inactividad; es normal. El `pool_pre_ping` de la app reconecta solo. |
| Sesiones invalidadas tras cada deploy | Define `SECRET_KEY` fija (el blueprint la genera una vez y la mantiene). |

## Coste

| Pieza | Plan | Coste |
| --- | --- | --- |
| Render Web Service | free | 0 € (se duerme por inactividad) |
| Neon Postgres | free (0.5 GB) | 0 € |
| Telegram | - | 0 € |
| Dominio propio (opcional) | - | ~10 €/año |

Si necesitas mas de 0.5 GB de base de datos o no quieres el arranque en frio, el siguiente paso es
Render Starter con disco, o un VPS de 4 €/mes con `docker compose up -d`.
