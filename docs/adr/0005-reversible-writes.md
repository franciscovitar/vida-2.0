# ADR 0005 — Escrituras reversibles (Block 3)

- **Estado:** aceptado para Block 3.
- **Fecha:** 2026-07-28.
- **Supersede / extiende:** [ADR 0002](./0002-safe-writes-runtime.md) (runtime fail-closed);
  no reemplaza el Policy Engine ni la flag `WRITE_ACTIONS_ENABLED`.

## Contexto

Block 3 necesita aplicar cambios en Notion, Sheets y Calendar con compensación acotada, sin
pretender transacciones ACID entre proveedores. El runtime 8E.1 ya falla cerrado y usa un ledger
Notion para propuestas; faltaba coordinación distribuida, cifrado de payloads, leases y rollback
ownership-scoped.

## Decisión

1. **Saga + leases, no ACID multi-proveedor.** Reserva de idempotencia → intention audit → write →
   finalize. Leases de propuesta (`approve` / `reject` / `rollback`) impiden doble decisión y
   approve+rollback concurrentes. No hay commit 2PC ni rollback mágico entre Notion/Sheets/Calendar.
2. **Ledger Notion (base Acciones).** Fuente de verdad de propuestas, estados de saga, digests y
   metadatos sanitizados. Sin plaintext de payload en el ledger.
3. **Coordinación Upstash Redis.** Namespace `vida2:writes:<env>:<contractVersion>` separado de
   OpenClaw. Scripts EVAL para reserve/replay, CAS de lease y mark-final. Modo `unavailable` /
   `memory-test` fuera de Preview/Production real.
4. **Payloads AES-256-GCM.** Clave `WRITE_PROPOSAL_ENCRYPTION_KEY` (32 bytes base64). Envelope
   versionado; store con TTL (`WRITE_APPROVAL_TTL_SECONDS`). Nunca loguear plaintext, nonce ni clave.
5. **Compensaciones por acción.**
   - Sheets gym: `markReverted` (nunca borrar filas).
   - Calendar: `deleteHoldWithOwnership` solo sobre holds propios; nunca `calendar.event.create`.
   - Notion task/inbox: archive ownership-scoped.
   - Ownership requerido para rollback cuando el puerto lo exige; sin ownership → `rollback-failed`.
6. **Ventana de rollback** `WRITE_ROLLBACK_WINDOW_SECONDS` (default 7 días) desde `applied`.
7. **Contrato** `WRITE_CONTRACT_VERSION=vida2-writes-v1` en propuestas y namespace de coordinación.

## Alternativas descartadas

### Transacción distribuida / outbox multi-cloud

Descartado: coste operativo y falsa sensación de atomicidad entre APIs ajenas.

### Soft-delete genérico en todos los proveedores

Descartado: Sheets marca `reverted`; Calendar solo borra holds propios; Notion archiva con proof.

### Payload en claro en Redis o Notion

Descartado: amenaza de filtración en backups/logs; AES-GCM + TTL es el mínimo.

## Consecuencias

- Fallos parciales (p. ej. gym `partial`) quedan visibles; compensación es `markReverted`, no undo
  silencioso.
- Preview exige Upstash + clave de cifrado + ledger Notion cuando la flag está activa.
- Tests usan solo memory ports / fake EVAL fetch; cero I/O a Google/Notion.
- Documentación operativa: `docs/block-3-reversible-writes.md`.
