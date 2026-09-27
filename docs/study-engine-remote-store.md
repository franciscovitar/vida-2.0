# Study Engine remote attempt store — V1

Stage 6C connects the local outbox to durable server-side persistence without adding another database product.

## Provider and isolation

Vida reuses the existing Upstash Redis REST connection already active for server infrastructure.

- physical store: existing Upstash database;
- server-only credentials: existing `UPSTASH_REDIS_REST_URL/TOKEN`;
- Study Engine namespace: `vida2:study-engine:<environment>:v1`;
- user identity in Redis keys: opaque SHA-256 digest, never email;
- attempt identity: opaque SHA-256 digest of user + idempotency key.

Preview and Production remain isolated by namespace.

## Exactly-once rule

A single Redis Lua transaction checks and writes each immutable attempt.

- missing key -> store + index -> `accepted`;
- same key + same canonical payload -> `duplicate`;
- same key + different payload -> `conflict`.

Only `accepted` or `duplicate` clears the browser outbox. Conflicts stay pending.

## HTTP boundary

`POST /api/study-engine/v1/attempts` requires a valid Vida Auth.js session before the remote store is created. It also requires JSON, a matching `Idempotency-Key`, same-origin when Origin is present, and a bounded validated Study Attempt payload. Store failures return 503 without leaking credentials or provider details.

There is no public read/list endpoint in V1.

## Deterministic E2E

Tests cover:

`offline outbox -> HttpStudyAttemptTransport -> API handler -> atomic Upstash adapter`

and prove `N pending -> N remote` plus exact retry -> `duplicate` without increasing the remote count.

A live-provider write still requires a deployed, authenticated Vida session. Repository tests do not pretend to possess the user's Auth.js cookie.
