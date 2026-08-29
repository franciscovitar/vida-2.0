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

## Firma HMAC-SHA256 v2

Headers y gramáticas cerradas:

- `X-Vida-Key-Id`: 1–64 caracteres ASCII, `[A-Za-z0-9._-]`;
- `X-Vida-Timestamp`: exactamente 13 dígitos de epoch ms;
- `X-Vida-Signature`: exactamente 64 caracteres hexadecimales lowercase;
- `X-Vida-Request-Id`: 1–128 caracteres ASCII, `[A-Za-z0-9._:-]`.

Canonical string:

```text
vida2-openclaw-hmac-v2
timestamp
requestId
METHOD
pathname
sha256Hex(rawBody)
```

El request ID está firmado. Método, pathname y ausencia de query se validan contra el
contrato exacto de cada handler. No se recortan ni normalizan silenciosamente headers
de autenticación.

Para GET, el body está prohibido y el hash corresponde a la cadena vacía. Para POST,
solo se acepta `application/json` o `application/json; charset=utf-8`.

Reglas implementadas en 3A:

- comparación timing-safe sobre 32 bytes;
- skew máximo de cinco minutos;
- errores de credenciales uniformes;
- paths, métodos y query fail-closed;
- respuestas con `Cache-Control: no-store`;
- sin stack traces, canonical strings ni secretos.

Reglas implementadas en 3B:

- `Content-Length` inválido o superior a 64 KiB se rechaza antes de leer;
- el stream se cancela al superar 64 KiB;
- una longitud declarada discordante falla cerrada;
- HMAC calcula el hash sobre los bytes originales;
- UTF-8 se decodifica en modo fatal, sin reemplazos silenciosos;
- JSON truncado, inválido o con claves duplicadas se rechaza;
- errores de lectura no entregan bodies parciales al reader.

Replay protection implementada en 3C:

- se reservan dos fingerprints SHA-256 opacos: request ID y canonical firmado;
- la reserva es atómica dentro del port;
- TTL fijo de 15 minutos;
- un duplicado responde `409 replay-detected`;
- store ausente o caído responde `503 security-control-unavailable`;
- memoria solo se admite en tests o desarrollo local explícito;
- Preview y Production fallan cerrados hasta conectar un store distribuido en 3D;
- una reserva ocurre después del rate limit y antes de interpretar JSON.

Etapa 3D-A implementa el adaptador distribuido:

- Upstash Redis mediante REST server-to-server, sin conexiones TCP persistentes;
- replay atómico con un único script `EVAL`;
- rate limit fijo por minuto con `INCR` + `EXPIRE` atómicos;
- claves opacas, separadas por entorno y sin key IDs en texto claro;
- timeout de tres segundos y respuestas remotas no confiables validadas;
- token únicamente en `Authorization`, nunca en URL, body, logs o errores;
- Preview/Production fallan cerrados si falta el store o cualquier control;
- memoria permanece limitada a tests y desarrollo local explícito.

La infraestructura Upstash quedó conectada y validada únicamente en Preview. El store
acepta reservas atómicas con claves opacas y TTL; Production continúa sin estas
variables. OpenClaw permanece apagado hasta la activación controlada final.

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

Cierre conjunto 3E–3G:

- cada operación usa un schema cerrado, sin coerciones ni campos desconocidos;
- cursores, límites, estados, fechas, slugs y claves opacas se validan estrictamente;
- `documents.search` y `document.get` exigen `policy.generalAI=allowed`;
- una frontera de salida rechaza IDs internos, secretos, correos en texto, URLs
  externas, Journaling, objetos no planos, ciclos y profundidad excesiva;
- el tamaño máximo de 256 KiB se mide sobre el JSON completo de la respuesta;
- health y capabilities publican readiness sanitizado (apiStatus, status,
  securityControls) sin consultar fuentes;
- las respuestas incluyen `itemCount` además de freshness, sources y cursor;
- `approvals.list` permanece en el contrato pero responde `source-unavailable`
  hasta existir un lector read-only aislado;
- propuestas y escrituras continúan físicamente bloqueadas.
- Calendar en OpenClaw usa un lector server-to-server dedicado (sin cookies);
  `/agenda` sigue exigiendo sesión web. Ambos reutilizan el mismo loader de
  solo lectura y los mismos fallos cerrados.

## Propuestas y escrituras

Las operaciones `*.propose`, la consulta de propuestas, aprobar/rechazar y cualquier
escritura final se anuncian como `forbidden`.

Una firma HMAC válida no concede permisos de escritura. `WRITE_ACTIONS_ENABLED` no
debe ampliar el contrato OpenClaw.

El aislamiento físico está completo: las dos rutas de propuestas solo autentican la
solicitud y responden `403 forbidden`. No importan parsers de propuestas, repositorios,
Policy Engine, auditoría, idempotencia ni runtime de escrituras.

## Variables

| Variable                       | Default    | Bloque 2                       |
| ------------------------------ | ---------- | ------------------------------ |
| `OPENCLAW_API_ENABLED`         | `false`    | `true` solo después del QA     |
| `OPENCLAW_ACCESS_MODE`         | `disabled` | Únicamente `read-only`         |
| `OPENCLAW_API_KEY_ID`          | —          | Solo servidor y por entorno    |
| `OPENCLAW_API_SECRET`          | —          | Solo servidor y por entorno    |
| `OPENCLAW_API_RATE_PER_MINUTE` | `60`       | Límite distribuido             |
| `OPENCLAW_RATE_LIMIT_MODE`     | cerrado    | `upstash` en Vercel            |
| `OPENCLAW_REPLAY_MODE`         | cerrado    | `upstash` en Vercel            |
| `UPSTASH_REDIS_REST_URL`       | —          | Solo servidor y por entorno    |
| `UPSTASH_REDIS_REST_TOKEN`     | —          | Sensitive, nunca en respuestas |

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
