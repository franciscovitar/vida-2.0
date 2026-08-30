# Conversational Capture V1 — Vida execution boundary

## Goal

Let the user operate Vida by speaking/writing naturally while keeping the existing canonical sources,
Safe Writes guarantees and product boundaries intact.

The user should not choose a database or open a data-entry form.

```text
ChatGPT first / Telegram later / WhatsApp later
  -> PAS conversational-capture Skill
  -> grounded intent + missing-info check
  -> Vida capability registry
  -> canonical Safe Writes policy
  -> proposal / narrowly authorized direct apply
  -> Notion | Sheets | Calendar
  -> Vida Web as derived command center
```

ADR 0006 remains the durable product decision. This document defines the first concrete execution
boundary; it does not replace the ADR.

## Ownership split

### PAS owns

- segmentation of messy messages into independent intents;
- grounding/provenance discipline;
- corrections vs new observations;
- missing-information questions;
- channel-neutral routing;
- replay-safe source-event identity;
- delegation to domain Skills such as Gym Intelligence and Nutrition Intelligence.

### Vida owns

- which product actions actually exist;
- canonical destination for those actions;
- payload validators;
- risk / reversibility / confirmation policy;
- readiness and authorization;
- idempotency, audit, encryption, leases and rollback;
- concrete provider adapters.

OpenClaw may become a channel executor/gateway, but it does not own these policies.

## V1 Vida capability registry

`lib/capture/contracts.ts` exposes only the business actions that already exist in Safe Writes:

| Operation              | Canonical authority                      | Execution contract              |
| ---------------------- | ---------------------------------------- | ------------------------------- |
| `task.create`          | Notion Tasks                             | proposal-only                   |
| `task.change-status`   | Notion Tasks                             | proposal-only                   |
| `inbox.capture`        | Notion Inbox                             | proposal or scoped direct-apply |
| `gym.session.create`   | Google Sheets Gym                        | proposal-only                   |
| `calendar.hold.create` | dedicated Google Calendar holds calendar | proposal-only                   |

The registry deliberately does not duplicate risk/confirmation/reversibility values. Those are read
from the existing Safe Writes Policy Engine. Direct apply for `inbox.capture` fails closed if its
canonical policy stops being explicit, low risk or reversible.

No control operation (`proposal.approve`, `proposal.reject`, `action.rollback`) is a semantic capture
intent.

## Nutrition boundary

Nutrition Intelligence already implements the desired conversational behavior against its own
structured Google Sheets store. Its meal/correction/recipe/outcome contracts remain canonical there.

V1 does **not** duplicate those schemas inside Vida merely to make routing look uniform. PAS can route
a nutrition intent to the Nutrition Intelligence contract. A future Vida bridge may expose a
sanitized capability if/when the command-center integration needs it.

The same principle applies to any future domain: register a capability, do not copy its database.

## First direct-apply policy: Inbox only

`inbox.capture` is the first and only Vida business action eligible for direct apply in this slice.
The implementation is intentionally narrower than a generic direct-write API:

- only trusted `chatgpt` transport identity is accepted by the internal executor;
- the user intent must already be classified as an explicit request to write;
- both `WRITE_ACTIONS_ENABLED=true` and the separate
  `CONVERSATIONAL_INBOX_DIRECT_APPLY_ENABLED=true` gate are required;
- Safe Writes readiness for Inbox, ledger, audit, coordination and rollback must be ready;
- transport principal and source-event identifiers are server-side inputs, not model-generated body
  identity;
- the same source event is idempotent and cannot be reused for different content;
- the canonical Inbox validator still governs text/link/origin;
- Notion Inbox remains the only content source of truth;
- the actions ledger stores only sanitized evidence (`contentPresent`, origin and link presence), not
  the captured text;
- the ledger retains target ownership and rollback deadline so the existing `action.rollback` path can
  compensate the capture;
- if the business write succeeds but the ledger cannot certify `applied`, the executor attempts the
  ownership-scoped compensation immediately and never retries the write automatically.

This is **technical capability, not Production activation**. The flag remains fail-closed by default,
and this slice does not expose a new public endpoint or a ChatGPT adapter by itself.

## ChatGPT-first slice

The first useful end-to-end behavior remains:

1. user sends a messy but actionable message in ChatGPT;
2. PAS resolves one or more grounded intents;
3. only materially missing information is requested;
4. each intent is matched to a registered capability/domain contract;
5. current target policy is evaluated;
6. for an explicitly requested Inbox capture, the trusted adapter may call the scoped direct executor
   only when its separate gate and readiness are active;
7. successful independent intents are not repeated because another intent is blocked;
8. user receives a brief effect summary, not provider IDs or database mechanics.

Tasks, Gym and Calendar remain proposal-only. Calendar must not inherit Inbox direct-apply merely
because the shared Safe Writes substrate exists.

## Channel progression

- **ChatGPT:** first surface; validate intent/routing/policy semantics and Inbox direct capture.
- **Telegram:** thin authenticated transport adapter over the same contract once ChatGPT flow is
  stable.
- **WhatsApp:** later, only if it can preserve the same identity, idempotency, privacy and operational
  boundaries without disproportionate maintenance.

No channel-specific business routing.

## Non-goals for this slice

- no new database;
- no generic business-write endpoint;
- no generic `calendar.event.create`;
- no automatic Journaling access;
- no automatic OpenClaw proposal activation;
- no Automations activation;
- no broad agent autonomy;
- no copying Nutrition/Gym raw history into Vida;
- no direct apply for Tasks, Gym or Calendar;
- no Production activation of the new Inbox gate yet.

## Next implementation step

After the internal direct transaction passes tests and code review, build the smallest authenticated
ChatGPT → Vida adapter that can supply trusted principal/source-event identity and invoke only
`inbox.capture` direct apply. Preview/dev validation comes before any Production flag change.
