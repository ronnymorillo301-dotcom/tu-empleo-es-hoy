# TU EMPLEO ES HOY — versión lista para publicar

## Estructura
Los archivos importantes están en la raíz del proyecto:
- `server.js`
- `package.json`
- `package-lock.json`
- `frontend/`
- `database/app.db`
- `curriculums/`

**No muevas `server.js` ni `package.json` dentro de `frontend`.**

## Railway
Configura el servicio para usar la carpeta raíz del proyecto (donde están `package.json` y `server.js`).

El comando de inicio es:
```bash
npm start
```

Railway también puede leer `railway.json` incluido en este proyecto.

Variables recomendadas:
```text
NODE_ENV=production
ADMIN_EMAILS=tu-correo@dominio.com
```

No es necesario fijar `PORT`; Railway lo proporciona automáticamente.

## Almacenamiento
SQLite y los currículums se guardan en:
- `database/app.db`
- `curriculums/`

Para conservarlos después de reinicios/redeploys, usa almacenamiento persistente/Volume en el servicio.

## Prueba después de publicar
1. Abre la URL principal.
2. Comprueba que aparece la página de inicio.
3. Abre `/api/estado`; debe responder con `ok: true`.
4. Registra una cuenta.
5. Inicia sesión.
6. Sube un currículum PDF/DOC/DOCX de máximo 5 MB.
7. Publica una oferta.
8. Prueba una postulación.

## Importante
No subas `node_modules/`. El servidor instala las dependencias con `npm ci`.

La aplicación está preparada para Node.js 20.x por estabilidad con `better-sqlite3`.


## IMPORTANTE PARA ESTA VERSIÓN CORREGIDA
Al abrir el ZIP, `server.js` y `package.json` deben verse directamente en la raíz.
No debes entrar en otra carpeta para encontrarlos.

La aplicación ahora también:
- corrige automáticamente bases de datos antiguas con la columna `telefono`;
- acepta `/`, `/login`, `/registro`, `/ofertas`, `/perfil`, `/postulantes`;
- mantiene las páginas `.html` normales;
- responde correctamente al healthcheck `/api/estado`.
