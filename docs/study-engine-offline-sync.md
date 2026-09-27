# Study Engine Offline — Stage 6B

Stage 6B adds the **sync engine contract** without choosing a durable cloud provider yet.

## Exactly-once model

The client sends one immutable attempt with a stable `idempotencyKey`.

The remote transport must reply with one of:

- `accepted` — first durable acceptance;
- `duplicate` — the same idempotency key and the same payload were already durably accepted;
- `conflict` — the identity already exists with incompatible content.

The local outbox entry is removed only after `accepted` or `duplicate`. A transport error or conflict leaves the attempt pending.

This means a crash after remote acceptance but before local acknowledgement is repairable: the next flush receives `duplicate` and safely clears the outbox without creating a second remote event.

## Flush behavior

`StudyAttemptSyncEngine`:

1. reads pending attempts in stable order;
2. sends sequentially;
3. acknowledges locally only after a safe remote acknowledgement;
4. stops on transport failure or conflict;
5. coalesces concurrent flush calls so one process does not double-send the same local batch.

## Reconnect behavior

`attachStudyReconnectSync` provides the browser lifecycle hook:

- flush immediately when attached while online;
- flush again on the browser `online` event;
- detach cleanly when the caller is disposed.

It remains transport-injected. There is intentionally no fake production endpoint and no silent claim of cloud durability.

## Deferred to 6C

A later bounded stage must choose/implement the authenticated durable server endpoint, validate real reconnect against it, and decide the PWA/service-worker shell strategy. Hito 6 stays in progress until that end-to-end path proves events survive offline/reconnect exactly once.
