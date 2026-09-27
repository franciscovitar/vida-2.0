# Study Engine Offline — Stage 6A

This stage implements the first offline-first invariant: **persist the attempt locally before advancing the review UI**.

## Local stores

Browser IndexedDB contains two stores in one database transaction:

- `attempts` — append-only learner attempt history, keyed by stable attempt id;
- `outbox` — pending sync references, keyed by idempotency key.

An accepted local answer writes both records atomically. Removing an outbox entry after future cloud acknowledgement never deletes the attempt history.

## Idempotency

Retrying the exact same attempt is a no-op. Reusing the same attempt/idempotency identity with a different payload fails closed.

## UI boundary

`StudySession` awaits local persistence before advancing to the next item. If IndexedDB fails, the current item remains on screen and the user gets an explicit save error instead of a false success.

## Deferred to the next bounded stage

This stage does **not** claim cloud sync/reconnect, multi-device conflict resolution, PWA shell caching or Learning OS write-back. Those remain separate checkpoints so no single work unit exceeds the user's requested 20–25 minute ceiling.
