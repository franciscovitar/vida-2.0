# ADR 0004 — OpenClaw estrictamente read-only

## Estado

Aceptado para el Bloque 2. No autoriza activación externa.

## Contexto

La API OpenClaw existente combina lecturas y creación/consulta de propuestas.
Una propuesta persiste datos y por lo tanto no pertenece a un contrato
estrictamente solo lectura.

## Decisión

Se adopta el contrato:

```text
OPENCLAW_API_ENABLED=false|true
OPENCLAW_ACCESS_MODE=disabled|read-only|full
```

Durante el Bloque 2:

- solo `read-only` puede habilitar la autenticación HMAC;
- `disabled`, valores desconocidos, ausencia de modo y `full` fallan cerrados;
- `health`, `capabilities` y `read` son las únicas familias habilitables;
- las operaciones de propuesta se anuncian como `forbidden`;
- `WRITE_ACTIONS_ENABLED` no puede ampliar permisos de OpenClaw;
- Production permanece con la API apagada hasta QA y autorización explícita.

`full` queda reservado como nombre de contrato para una fase futura. Su presencia
no implica soporte actual.

## Consecuencias

- La configuración necesita dos compuertas independientes: flag y modo.
- Capabilities no anuncia operaciones de propuesta disponibles.
- Health no expone el estado global de escrituras.
- Las rutas de propuestas no importan ni construyen componentes de escritura.
- Una key firmada válida recibe `403` sin crear ni consultar propuestas.
- El transporte usa canonical HMAC v2 con request ID firmado, headers de gramática
  cerrada y contratos exactos de método, path y query.
- Los POST leen como máximo 64 KiB por stream, firman bytes originales y rechazan
  UTF-8 inválido, streams truncados y claves JSON duplicadas.
- Replay reserva fingerprints opacos por request ID y canonical durante 15 minutos.
- Duplicados responden `409`; un store ausente o caído responde `503` fail-closed.
- El adaptador distribuido usa Upstash Redis REST y scripts atómicos para replay y
  rate limit; no se habilita con configuración parcial.
- Preview usa infraestructura distribuida real; Production continúa sin configurar.
- Los lectores aplican schemas cerrados, política `generalAI`, readiness sanitizado y
  una frontera de salida que falla cerrada ante datos no autorizados.
- OpenClaw no construye el runtime de escrituras para listar propuestas; sin un
  lector read-only dedicado, `approvals.list` queda `unavailable`.
- La autorización `generalAI` de `document.get` usa catálogo fresco, no el TTL
  de `unstable_cache`, antes de revelar redirects o leer bloques.

## Rollback

1. Configurar `OPENCLAW_API_ENABLED=false`.
2. Configurar `OPENCLAW_ACCESS_MODE=disabled`.
3. Revocar la key HMAC del entorno afectado.

No es necesario rotar credenciales de Notion, Sheets o Calendar porque OpenClaw
nunca debe recibirlas.
