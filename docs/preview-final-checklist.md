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
