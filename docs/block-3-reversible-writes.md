# Block 3 — Escrituras reversibles

Arquitectura operativa de propuestas cifradas, saga fail-closed, coordinación Upstash y
compensaciones ownership-scoped. Complementa [ADR 0002](./adr/0002-safe-writes-runtime.md) y
[ADR 0005](./adr/0005-reversible-writes.md).

## Arquitectura

```text
Cliente autenticado
  → runWriteAction / OpenClaw proposals (solo control)
    → Policy Engine (flag, auth, confirmación, allowlist)
      → WriteCoordination (idempotencia + leases)
        → Audit intention
          → Handlers (propuestas / negocio vía approve)
            → Ports: Notion ledger | Sheets gym | Calendar hold
          → Audit finalize / applied-audit-pending
```

Fuentes:

| Dato                           | Fuente de verdad                                   |
| ------------------------------ | -------------------------------------------------- |
| Propuestas, auditoría, estados | Notion Acciones (ledger)                           |
| Gym sessions/sets              | Google Sheets (mark reverted, no delete)           |
| Holds de tiempo                | Google Calendar write calendar (delete owned only) |
| Idempotencia / leases          | Upstash Redis (`vida2:writes:<env>:<contract>`)    |
| Payload de propuesta           | Store cifrado AES-256-GCM + TTL                    |

No hay ACID entre proveedores. La saga ordena intention → write → finalize y registra fallos
parciales de forma explícita.

## State machine (propuesta)

```text
pending
  ├─(reject)→ rejected
  ├─(expire)→ expired
  └─(approve lease)→ executing
        ├─(ok)→ applied
        │         ├─(rollback lease, ownership ok)→ rolling-back → rolled-back
        │         └─(rollback fail)→ rollback-failed
        └─(fail / decrypt / conflict)→ failed
```

Estados terminales: `rejected`, `expired`, `failed`, `rolled-back`, `rollback-failed`.
`applied` admite rollback solo dentro de `rollbackDeadline` y si `reversible`.

## Contratos

- `WRITE_CONTRACT_VERSION` default `vida2-writes-v1`.
- Acciones públicas de control: `proposal.create` | `proposal.approve` | `proposal.reject` |
  `action.rollback` (`isPublicControlAction`).
- Acciones de negocio (`task.*`, `inbox.capture`, `gym.session.create`, `calendar.hold.create`)
  viven dentro del approve; la puerta pública unit-tested las niega vía `isPublicControlAction`.
- Confirmación reforzada: approve → frase `aprobar`; rollback → `revertir`.
- Respuestas y auditoría: sin emails crudos, UUID de proveedor, URLs internas ni secretos.

## Rollback por acción

| Acción                 | Compensación                      | Ownership      |
| ---------------------- | --------------------------------- | -------------- |
| `task.create`          | `archiveOwnedTask`                | requerido      |
| `inbox.capture`        | `archiveCapture` + verify absent  | requerido      |
| `gym.session.create`   | `markReverted` (filas permanecen) | no (sesión id) |
| `calendar.hold.create` | `deleteHoldWithOwnership`         | requerido      |
| `task.change-status`   | restaurar `before` vía diff CAS   | n/a (diff)     |

Calendar: solo holds creados por el sistema; duración 15 min–4 h; futuro; nunca
`calendar.event.create`.

## Threat model (resumen)

| Amenaza                    | Mitigación                                      |
| -------------------------- | ----------------------------------------------- |
| Escritura accidental       | Flag exacta `true`; fail-closed; confirmaciones |
| Replay / doble apply       | Reserva idempotencia + digest; leases           |
| Approve+rollback race      | Sibling lease keys                              |
| Filtración de payload      | AES-GCM; TTL; sin plaintext en ledger/logs      |
| Rollback de recurso ajeno  | Ownership proof                                 |
| Exfiltración vía auditoría | `auditLooksSafe`; hints sanitizados             |
| Journaling / destructivos  | Forbidden action types en Policy Engine         |

## Readiness

`getWriteRuntimeStatus()` (sanitizado):

- Flag off → todo `disabled`.
- Memory solo en `NODE_ENV=test` o `WRITE_ACTIONS_USE_MEMORY=true` fuera de Preview/Production.
- Preview/Production: Notion live + ledger + encryption key + Upstash + calendar write id + gym
  ranges según capacidad.

Issues son códigos (`encryption-key-missing`, `coordination-unavailable`, …), nunca valores.

## Emergency stop runbook

1. En Vercel: `WRITE_ACTIONS_ENABLED=false` (y `OPENCLAW_PROPOSALS_ENABLED=false` si aplica).
2. Redeploy / wait env propagation; confirmar `getWriteRuntimeStatus().writesEnabled === false`.
3. No rotar secretos a ciegas a mitad de sagas; documentar propuestas `executing` / `rolling-back`.
4. Si hay ciphertext huérfano: TTL del store lo expira; no reintentar approve sin revisión.
5. Comunicar a Work: flag off, timestamp, propuestas afectadas (keys opacas).

## QA Preview plan

1. Preflight: flag off → cero I/O de escritura.
2. Flag on + memory **prohibido** en Preview.
3. Crear propuesta → diff → ciphertext presente en store, ausente en ledger.
4. Approve reforzado → applied; reject / expire / double decision.
5. Rollback dentro de ventana con ownership; fuera de ventana → `expired`.
6. Gym partial → status `partial`; compensación → `reverted`.
7. Calendar hold constraints; dual lease conflict.
8. Auditoría: intention antes de write; sin emails/ids/secrets (`auditLooksSafe`).
9. `npm test` + suite `tests/block3-*.test.ts`.

## Known limits

- Sin atomicidad multi-proveedor; `partial` / `applied-audit-pending` son estados reales.
- Concurrencia extrema en Notion puede duplicar filas raramente (idempotencia best-effort).
- Memory coordination no es producción.
- OpenClaw no aprueba ni ejecuta escrituras finales.

## Work schema checklist (Notion Acciones / Tareas)

Antes de activar escrituras reales en Preview, verificar en Work:

| Recurso                        | Requisito                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Base **Acciones y propuestas** | Select `Status` con: `pending`, `executing`, `applied`, `rejected`, `expired`, `failed`, `rolling-back`, `rolled-back`, `rollback-failed` |
| Acciones                       | Propiedad rich_text `Payload sanitizado` (codec multi-fragmento; sin truncar campos críticos)                                             |
| Acciones                       | Select de `Action type` incluye acciones de negocio + control (`proposal.*`, `action.rollback`, `task.*`, …)                              |
| Tareas                         | Propiedad rich_text de ownership: default `Vida2 Ownership` (override `NOTION_TASK_OWNERSHIP_PROPERTY`)                                   |
| Bandeja                        | Página compartida (`NOTION_INBOX_PAGE_ID`); mapping blockId en Upstash                                                                    |
| Calendar                       | `GOOGLE_CALENDAR_WRITE_ID` dedicado + OAuth Calendar (sin attendees/meet)                                                                 |
| Upstash                        | REST URL/token; namespace `vida2:writes:<env>:<contract>` (payload + inbox-map + idemp/leases)                                            |
| Cifrado                        | `WRITE_PROPOSAL_ENCRYPTION_KEY` (32 bytes base64)                                                                                         |

## Incident recovery

| Síntoma                       | Acción                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Propuesta `executing` colgada | Revisar lease TTL; no aprobar de nuevo; marcar failed manualmente en ledger si procede |
| `applied-audit-pending`       | Escritura ya ocurrió; completar auditoría; no reejecutar                               |
| `rollback-failed`             | Verificar ownership / recurso; compensación manual acotada                             |
| Clave de cifrado perdida      | Propuestas pending no descifrables → expire/reject; rotar clave con cuidado            |
| Upstash down                  | Fail closed (`misconfigured` / lease unavailable); emergency stop si hace falta        |

## Variables (placeholders)

Ver `.env.example`: `WRITE_ACTIONS_*`, `WRITE_COORDINATION_MODE`, TTL/ventana/contrato,
`WRITE_PROPOSAL_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_WRITE_ID`, `NOTION_TASK_OWNERSHIP_PROPERTY`,
Upstash, `OPENCLAW_PROPOSALS_ENABLED`.
