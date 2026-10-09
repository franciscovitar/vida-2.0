# Vida 2.0 — Preview final de Web V1

Este documento prepara un deployment de Preview completo sin tocar Production.
No contiene valores, IDs, correos ni secretos.

## Objetivo

El Preview debe validar la aplicación con datos reales de lectura y con las capacidades sensibles
apagadas. El preflight comprueba configuración, no conectividad externa ni calidad del contenido.

## Variables esperadas en Vercel Preview

### Aplicación y autenticación

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_ALLOWED_EMAILS`
- `AUTH_TRUST_HOST=true`
- `AUTH_REDIRECT_PROXY_URL=https://vida-2-0-git-qa-genova.vercel.app/api/auth`

`AUTH_REDIRECT_PROXY_URL` va únicamente en el entorno Preview. La rama persistente `qa` debe
mantener el alias `https://vida-2-0-git-qa-genova.vercel.app`; ese deployment sirve como proxy
Auth.js para el propio QA y para los previews de PR. Todos los deployments Preview ya comparten
`AUTH_SECRET`, condición necesaria para validar el `state` entre el preview de origen y el proxy.
No fijar `AUTH_URL` ni `NEXTAUTH_URL`: el host inicial se deriva de la petición.
Si cualquiera de esas variables está definida en Preview, el preflight debe bloquear la
certificación porque puede fijar el callback al host equivocado.

Registrar una sola vez en el cliente Google Web usado por `AUTH_GOOGLE_ID` esta URI exacta:

```text
https://vida-2-0-git-qa-genova.vercel.app/api/auth/callback/google
```

No registrar callback URLs por deployment y no reutilizar el cliente independiente de Calendar.
El cliente de login usa solo `openid email profile`; el callback proxy añade la protección `state`
de Auth.js. Mantener `AUTH_REDIRECT_PROXY_URL` ausente en Production.

Vercel Deployment Protection y Auth.js son dos controles separados. Mantener Vercel Authentication
activa para Production y Previews. El usuario autorizado debe tener acceso al proyecto Vercel; el
token de Vercel es por URL, así que el alias `qa` da una URL estable para el acceso de rutina. Al
abrir un Preview de PR diferente, Vercel puede pedir su acceso de equipo para esa URL; después,
Google vuelve por el proxy estable y Auth.js devuelve el flujo al Preview original. Las rutas de la
app siguen exigiendo la sesión Auth.js y la allowlist exacta. `AUTH_ALLOWED_EMAILS` se compara sin
distinguir mayúsculas y con espacios recortados; incluye únicamente las cuentas autorizadas para
Preview y no copies una allowlist más amplia a Production.

La cookie Auth.js usa `HttpOnly`, `Secure` en Vercel Preview, `SameSite=Lax`, ruta `/` y no fija
`Domain`; queda limitada al host del Preview. El proxy estable comparte el `state` de OAuth, pero el
callback final del Preview emite la sesión para el host original.

### Google Sheets

- `DATA_SOURCE=google`
- credenciales de la cuenta de servicio
- `GOOGLE_SHEETS_TARGET=dev`
- referencia al Sheet DEV
- `GOOGLE_SHEETS_ALLOW_PROD_WRITES=false`

El Preview nunca debe resolver el Sheet canónico.

### Notion operativo

- `NOTION_DATA_SOURCE=notion`
- token de integración
- referencias autorizadas de Áreas, Proyectos y Tareas

### Registro Web

- `WEB_CATALOG_ENABLED=true`
- referencia del data source del Registro Web
- `NOTION_WEB_CATALOG_API_TOKEN` con una integración documental dedicada de solo lectura
- la integración debe tener acceso a cada página canónica que se quiera mostrar

Journaling, recursos privados, legacy, de sistema y excluidos continúan cerrados por política.

### Google Calendar

- `GOOGLE_CALENDAR_DATA_SOURCE=google`
- cliente OAuth independiente del login
- refresh token de lectura
- lista explícita de calendarios autorizados
- zona horaria

No configurar `GOOGLE_CALENDAR_REDIRECT_URI` en Vercel. Esa variable es solo para obtener el
refresh token en localhost. La aplicación no implementa escrituras de Calendar.

### Capacidades fuera de Web V1

- `WRITE_ACTIONS_ENABLED=false`
- `OPENCLAW_API_ENABLED=false`
- no configurar `WRITE_ACTIONS_USE_MEMORY`
- no configurar overrides de tests ni traces locales

## Preflight

En un entorno que ya contiene las variables del Preview:

```bash
npm run preview:check
```

El comando:

- no imprime valores;
- falla con código distinto de cero ante una combinación insegura;
- rechaza target PROD en Preview;
- exige fuentes reales de lectura;
- exige Registro Web activo;
- exige escrituras avanzadas y OpenClaw apagados.

## Verificación externa posterior

Después de que el preflight pase:

1. crear el deployment de Preview;
2. iniciar sesión con un usuario autorizado;
3. abrir todas las rutas del menú en desktop y mobile;
4. confirmar que Ajustes muestre las fuentes como configuradas;
5. verificar Norte, Aprendizaje, Compras, Dieta, Facultad y documentos dinámicos;
6. comprobar navegación, alias, búsqueda y enlaces hijos;
7. comprobar Agenda con eventos reales, recurrencias y días completos;
8. verificar Gimnasio y su historial de solo lectura;
9. forzar temporalmente un permiso faltante y comprobar el estado de error cerrado;
10. restaurar la configuración y repetir `npm test` y `npm run verify`.

## Criterio de cierre

El Preview puede promoverse únicamente cuando:

- no muestra mocks en rutas que deberían usar datos reales;
- no expone IDs, correos, tokens ni URLs internas;
- no permite escrituras avanzadas;
- no publica Journaling ni contenido privado;
- todas las rutas responden en desktop y mobile;
- tests, lint, formato, TypeScript y build pasan;
- existe un punto de recuperación antes del merge.
