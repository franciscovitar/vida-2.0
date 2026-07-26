# OpenClaw API — contrato read-only del Bloque 2

API versionada server-to-server para el coordinador conversacional OpenClaw.

OpenClaw **no** es fuente de verdad y **no** accede directamente a Notion, Sheets,
Calendar ni credenciales. Solo habla con esta API; Vida 2.0 aplica autenticación,
privacidad, límites y observabilidad.

Durante el Bloque 2 la única capacidad habilitable es la lectura sanitizada.

## Arquitectura

```text
OpenClaw --HMAC--> /api/openclaw/v1/{health,capabilities,read}
                                     |
                                     v
                         lectores sanitizados de Vida 2.0
```

- Flag: `OPENCLAW_API_ENABLED` (default `false`).
- Modo obligatorio: `OPENCLAW_ACCESS_MODE=read-only`.
- `full` queda reservado para una fase futura y actualmente falla cerrado.
- Propuestas y escrituras permanecen prohibidas durante todo el Bloque 2.
- Production continúa apagada hasta QA y autorización explícita.

## Endpoints

| Método | Ruta                               | Bloque 2                      |
| ------ | ---------------------------------- | ----------------------------- |
| GET    | `/api/openclaw/v1/health`          | Estado sanitizado             |
| GET    | `/api/openclaw/v1/capabilities`    | Reads y operaciones forbidden |
| POST   | `/api/openclaw/v1/read`            | Lecturas tipadas              |
| POST   | `/api/openclaw/v1/proposals`       | Bloqueada en modo read-only   |
| GET    | `/api/openclaw/v1/proposals/{key}` | Bloqueada en modo read-only   |

Con la flag apagada o una combinación inválida: **404** uniforme (`api-disabled`).

## Firma HMAC-SHA256

Headers:

- `X-Vida-Key-Id`
- `X-Vida-Timestamp` (epoch ms)
- `X-Vida-Signature` (hex HMAC)
- `X-Vida-Request-Id`

Canonical string:

```text
timestamp + "\n" + METHOD + "\n" + pathname + "\n" + sha256Hex(rawBody)
```

Para GET, `rawBody` es cadena vacía.

Reglas actuales:

- comparación timing-safe;
- skew máximo de cinco minutos;
- body máximo declarado de 64 KiB;
- JSON obligatorio en POST;
- respuestas con `Cache-Control: no-store`;
- sin stack traces ni secretos.

Replay protection y rate limit distribuido siguen pendientes y bloquean la activación.

## Lecturas declaradas

- `system.overview`
- `areas.list`
- `areas.get`
- `tasks.list`
- `projects.list`
- `calendar.upcoming`
- `gym.summary`
- `approvals.list`
- `documents.search`
- `document.get`

Límites generales:

- listados de hasta 50;
- Calendar hasta 31 días;
- sin IDs internos de Notion;
- sin Journaling;
- sin contenido `hidden`, `legacy`, `private` o excluido;
- enlaces internos mediante slugs autorizados.

Los lectores server-to-server y la política `generalAI` todavía deben endurecerse antes
de habilitar el Preview.

## Propuestas y escrituras

Las operaciones `*.propose`, la consulta de propuestas, aprobar/rechazar y cualquier
escritura final se anuncian como `forbidden`.

Una firma HMAC válida no concede permisos de escritura. `WRITE_ACTIONS_ENABLED` no
debe ampliar el contrato OpenClaw.

El aislamiento físico de las rutas se completa en la Etapa 2.

## Variables

| Variable                       | Default    | Bloque 2                       |
| ------------------------------ | ---------- | ------------------------------ |
| `OPENCLAW_API_ENABLED`         | `false`    | `true` solo después del QA     |
| `OPENCLAW_ACCESS_MODE`         | `disabled` | Únicamente `read-only`         |
| `OPENCLAW_API_KEY_ID`          | —          | Solo servidor y por entorno    |
| `OPENCLAW_API_SECRET`          | —          | Solo servidor y por entorno    |
| `OPENCLAW_API_RATE_PER_MINUTE` | `60`       | Pendiente de store distribuido |
| `OPENCLAW_RATE_LIMIT_MODE`     | cerrado    | `memory` solo para tests/local |

La combinación incompleta, desconocida o `full` falla cerrada.

## QA futuro

1. Mantener API apagada durante el desarrollo.
2. Desplegar primero un Preview de la rama.
3. Usar key y secret exclusivos de Preview.
4. Habilitar `OPENCLAW_ACCESS_MODE=read-only`.
5. Verificar `health`, `capabilities` y las lecturas firmadas.
6. Confirmar que propuestas y escrituras permanecen bloqueadas.
7. Probar replay, rate limit, privacidad, logs y cero escrituras.
8. Apagar flag y confirmar 404.

## Restauración

1. `OPENCLAW_API_ENABLED=false`.
2. `OPENCLAW_ACCESS_MODE=disabled`.
3. Revocar la key HMAC del entorno afectado.
4. Retirar cualquier bypass machine-to-machine de Preview.

No es necesario rotar credenciales de Notion, Sheets o Calendar porque OpenClaw nunca
debe recibirlas.
