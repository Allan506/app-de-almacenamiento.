# Nube Lite

Edicion estatica de Nube: una aplicacion web instalable de almacenamiento ilimitado. Se compila a un
paquete estatico, se publica en GitHub Pages sin backend y guarda los archivos en tu espacio de Telegram.

```bash
npm ci
npm run dev     # http://localhost:12001
npm test
npm run build   # dist/
```

Guia completa de despliegue, limites y seguridad: [`../docs/deploy-github-pages.md`](../docs/deploy-github-pages.md).

## Estructura

```
src/
  lib/
    telegram.ts   Cliente de la Bot API: troceado, subida con progreso, descarga con reintentos y borrado
    library.ts    Vault: arbol de nodos, subidas, descargas, papelera y copias
    db.ts         IndexedDB (config, nodos, blobs locales, actividad)
    tree.ts       Logica pura del arbol: breadcrumb, dedupe, ciclos, estadisticas
    zip.ts        Zip por streaming en el navegador (fflate)
    preview.ts    Deteccion de tipo y parseo para las vistas previas (texto, md, json, csv, zip)
    media.ts      Playlist, velocidad, repeticion y memoria de posicion del reproductor
    config.ts     Lectura y validacion de la configuracion
    files.ts      Arrastrar y soltar con carpetas
  components/     Landing, Setup (asistente), barra lateral, topbar, tarjetas, modales, reproductor
  pages/Drive.tsx Estado principal de la unidad
public/           manifest, service worker e iconos de la app instalable
tests/            vitest: troceado, transporte, arbol, zip, reproductor y vistas previas
```
