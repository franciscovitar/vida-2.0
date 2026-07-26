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
- El Preview continúa bloqueado por readiness hasta completar body streaming,
  replay protection, rate limit distribuido, lectores dedicados y QA.

## Rollback

1. Configurar `OPENCLAW_API_ENABLED=false`.
2. Configurar `OPENCLAW_ACCESS_MODE=disabled`.
3. Revocar la key HMAC del entorno afectado.

No es necesario rotar credenciales de Notion, Sheets o Calendar porque OpenClaw
nunca debe recibirlas.
