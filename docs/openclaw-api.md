# OpenClaw API (8F.1)

API versionada server-to-server para el coordinador conversacional OpenClaw.
OpenClaw **no** es fuente de verdad y **no** accede a Notion, Sheets, Calendar ni credenciales.
Solo habla con esta API; Vida 2.0 aplica auth, privacidad, Policy Engine, idempotencia y auditoría.

## Arquitectura

```
OpenClaw  --HMAC-->  /api/openclaw/v1/*  -->  loaders / proposal.create (8E)
                                              |
                                              v
                                         /aprobaciones (usuario)
```

- Flag: `OPENCLAW_API_ENABLED` (default `false`; solo el literal `true` habilita).
- Escrituras finales: **prohibidas**. Solo `proposal.create` → estado `pending`.
- Aprobar/rechazar: exclusivamente web autenticada.

## Endpoints

| Método | Ruta                               | Descripción                             |
| ------ | ---------------------------------- | --------------------------------------- |
| GET    | `/api/openclaw/v1/health`          | Estado sin consultar fuentes            |
| GET    | `/api/openclaw/v1/capabilities`    | Operaciones read / proposal / forbidden |
| POST   | `/api/openclaw/v1/read`            | Lecturas tipadas                        |
| POST   | `/api/openclaw/v1/proposals`       | Crear propuesta                         |
| GET    | `/api/openclaw/v1/proposals/{key}` | Consultar propuesta opaca               |

Con flag apagada: **404** uniforme (`api-disabled`).

## Firma HMAC-SHA256

Headers:

- `X-Vida-Key-Id`
- `X-Vida-Timestamp` (epoch ms)
- `X-Vida-Signature` (hex HMAC)
- `X-Vida-Request-Id` (obligatorio)

Canonical string:

```
timestamp + "\n" + METHOD + "\n" + pathname + "\n" + sha256Hex(rawBody)
```

Para GET, `rawBody` es cadena vacía.

Ejemplo (Node):

```js
import { createHash, createHmac } from 'node:crypto';

function sign({ secret, timestamp, method, pathname, rawBody }) {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const canonical = `${timestamp}\n${method.toUpperCase()}\n${pathname}\n${bodyHash}`;
  return createHmac('sha256', secret).update(canonical).digest('hex');
}
```

Reglas: timing-safe compare; skew ±5 minutos; body máx. 64 KB; JSON en POST.

Actor interno: `openclaw:<keyId>`. Auditoría usa hint ofuscado (`openclaw:ab***`).

## Lecturas

`system.overview`, `areas.list`, `areas.get`, `tasks.list`, `projects.list`,
`calendar.upcoming` (máx. 31 días), `gym.summary`, `approvals.list`,
`documents.search`, `document.get`.

Límites: listados máx. 50; sin IDs Notion; sin Journaling/privados/legacy/hidden;
enlaces internos `/p/[slug]`.

## Propuestas

Operaciones: `task.create.propose`, `task.change-status.propose`,
`inbox.capture.propose`, `gym.session.create.propose`, `calendar.block.propose`.

Requiere `WRITE_ACTIONS_ENABLED=true` y base de acciones configurada para persistir.
Estado inicial `pending`. No crea eventos Calendar. No permite approve/reject.

## Idempotencia

- Transporte: `X-Vida-Request-Id` (observabilidad / correlación).
- Dominio: `idempotencyKey` en body de propuestas → ledger 8E.
- Notion no garantiza unicidad atómica bajo concurrencia extrema.

## Errores

```json
{
  "ok": false,
  "requestId": "...",
  "error": { "code": "invalid-signature", "message": "...", "retryable": false }
}
```

Sin stack traces ni secretos.

## Variables (Work)

| Variable                       | Default | Notas                     |
| ------------------------------ | ------- | ------------------------- |
| `OPENCLAW_API_ENABLED`         | false   | Exactamente `true`        |
| `OPENCLAW_API_KEY_ID`          | —       | Solo servidor             |
| `OPENCLAW_API_SECRET`          | —       | Solo servidor             |
| `OPENCLAW_API_RATE_PER_MINUTE` | 60      | Límite local opcional     |
| `OPENCLAW_RATE_LIMIT_MODE`     | cerrado | `memory` solo tests/local |

No configurar desde Cursor. Preview primero. Production con escrituras desactivadas.

## Prueba real (Work)

1. Preview: `OPENCLAW_API_ENABLED=true` + key/secret.
2. Health + capabilities firmados.
3. Read `system.overview` / `areas.list`.
4. Crear propuesta Calendar → aparece en `/aprobaciones` como pending.
5. Confirmar que no hay evento Calendar ni approve vía API.
6. Apagar flag → 404.

## Restauración

1. `OPENCLAW_API_ENABLED=false`.
2. Rotar secreto si se filtró.
3. No borrar historial de propuestas; marcar `failed`/`expired` si hace falta.
