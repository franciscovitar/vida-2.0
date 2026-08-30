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
  -> proposal / future explicitly-authorized direct apply
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

| Operation | Canonical authority | Current execution |
| --- | --- | --- |
| `task.create` | Notion Tasks | proposal-only |
| `task.change-status` | Notion Tasks | proposal-only |
| `inbox.capture` | Notion Inbox | proposal-only |
| `gym.session.create` | Google Sheets Gym | proposal-only |
| `calendar.hold.create` | dedicated Google Calendar holds calendar | proposal-only |

The registry deliberately does not duplicate risk/confirmation/reversibility values. Those are read
from the existing Safe Writes Policy Engine.

No control operation (`proposal.approve`, `proposal.reject`, `action.rollback`) is a semantic capture
intent.

## Nutrition boundary

Nutrition Intelligence already implements the desired conversational behavior against its own
structured Google Sheets store. Its meal/correction/recipe/outcome contracts remain canonical there.

V1 does **not** duplicate those schemas inside Vida merely to make routing look uniform. PAS can route
a nutrition intent to the Nutrition Intelligence contract. A future Vida bridge may expose a
sanitized capability if/when the command-center integration needs it.

The same principle applies to any future domain: register a capability, do not copy its database.

## Current vs target execution policy

The current Safe Writes engine places business actions behind proposals/approval. Conversational
Capture V1 preserves that boundary exactly; `directApplyEnabled=false` for every Vida capability.

This is intentionally a staging point, not the final low-friction UX.

The next policy change should be designed separately and narrowly. Candidate actions for a first
controlled direct-apply experiment are those that are:

- clearly user-originated;
- low risk;
- reversible/correctable;
- idempotent;
- ownership-scoped;
- validated against the canonical target;
- useful enough that approval would add more friction than safety.

`inbox.capture` is the likely first candidate because its existing Safe Writes policy is low-risk and
reversible. This document does not activate that behavior.

Calendar should not be used as the first direct-apply experiment. The existing Calendar Hold runtime
and dedicated-calendar/OAuth work remain useful execution infrastructure, but the abandoned web-form
E2E is not the product path to resume.

## ChatGPT-first slice

The first useful end-to-end behavior should be:

1. user sends a messy but actionable message in ChatGPT;
2. PAS resolves one or more grounded intents;
3. only materially missing information is requested;
4. each intent is matched to a registered capability/domain contract;
5. current target policy is evaluated;
6. successful independent intents are not repeated because another intent is blocked;
7. user receives a brief effect summary, not provider IDs or database mechanics.

Until a direct-apply policy is explicitly implemented, Vida business actions remain proposal-only.
This prevents a conversational UI from becoming an accidental bypass around the security work already
certified.

## Channel progression

- **ChatGPT:** first surface; validate intent/routing/policy semantics.
- **Telegram:** thin authenticated transport adapter over the same contract once ChatGPT flow is
  stable.
- **WhatsApp:** later, only if it can preserve the same identity, idempotency, privacy and operational
  boundaries without disproportionate maintenance.

No channel-specific business routing.

## Non-goals for V1 foundation

- no new database;
- no generic `calendar.event.create`;
- no automatic Journaling access;
- no automatic OpenClaw proposal activation;
- no Automations activation;
- no broad agent autonomy;
- no copying Nutrition/Gym raw history into Vida;
- no direct apply until a separate policy/test/activation pass.

## Next implementation step

Design a narrow trusted conversational execution path for **one** low-risk reversible action
(preferably `inbox.capture`) that preserves the existing Safe Writes guarantees while eliminating the
second approval step when the target policy explicitly permits it.

After that passes, extend the same mechanism action-by-action instead of creating a generic bypass.
