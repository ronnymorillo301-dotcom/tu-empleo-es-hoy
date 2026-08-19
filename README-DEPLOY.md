# TU EMPLEO ES HOY — preparación para producción

## Requisitos
- Node.js 20 o superior
- npm

## Instalación
```bash
npm install
```

## Inicio local
```bash
npm start
```

## Producción
La aplicación usa `process.env.PORT` y puede ejecutarse con:
```bash
NODE_ENV=production npm start
```

### Importante sobre almacenamiento
Esta versión utiliza SQLite (`database/app.db`) y guarda currículums en `curriculums/`.
El servicio de alojamiento debe ofrecer almacenamiento persistente para ambos. No se debe desplegar en un entorno donde el disco sea efímero si se quiere conservar usuarios, ofertas, postulaciones y currículums.

### Seguridad incluida
- Contraseñas nuevas almacenadas con `crypto.scryptSync` y salt aleatorio.
- Migración automática de contraseñas antiguas en texto plano al iniciar el servidor.
- Sesiones con tokens aleatorios, cookie HttpOnly y duración limitada.
- Cookie `Secure` en producción.
- Encabezados HTTP básicos de seguridad.
- Límite de 5 MB y tipos PDF/DOC/DOCX para currículums.

## Antes de publicar
- Usar HTTPS.
- Configurar almacenamiento persistente para `database/app.db` y `curriculums/`.
- Configurar `NODE_ENV=production`.
- Configurar el puerto que entregue la plataforma.
- Hacer una prueba de registro, login, subida de CV, oferta y postulación después del despliegue.

## Protección del panel de postulantes
La ruta `/api/postulantes` está restringida a los correos definidos en `ADMIN_EMAILS`.
Configura esa variable en el servicio de alojamiento antes de publicar.

## Dependencias
No es necesario subir `node_modules/`. La plataforma debe ejecutar `npm install` o `npm ci`.
