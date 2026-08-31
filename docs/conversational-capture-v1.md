# Conversational Capture V1 — source-direct execution boundary

## Goal

Let the user operate Vida by speaking/writing naturally while keeping the canonical sources and
product boundaries intact.

The user should not choose a database, open a data-entry form or route the message through Vida Web.

```text
ChatGPT first / Telegram later / WhatsApp later
  -> PAS conversational-capture Skill
  -> grounded intent + missing-info check
  -> canonical authority + target policy
  -> trusted direct connector when sufficient
       OR Vida capability/runtime when it adds a required safety boundary
  -> Notion | Google Sheets | Google Calendar | Drive
  -> Vida Web reads and composes the result
```

ADR 0006 remains the durable product decision. This document defines the concrete V1 execution
boundary; it does not replace the ADR.

## Core routing rule

**The canonical source is the destination. Vida Web is not a write hop. Vida API/runtime is not a
mandatory write hop either.**

For each resolved intent, choose the smallest reliable path that preserves the target contract:

1. prefer a trusted, authorized connector that writes directly to the canonical authority;
2. use Vida Safe Writes when Vida contributes guarantees that are actually required and are not
   equivalently provided by the direct connector/path;
3. use OpenClaw or another gateway only as transport/execution infrastructure, never as another
   authority or database.

Do not add a webhook, queue, mirror table or Vida proxy merely to preserve architectural uniformity.

## Ownership split

### PAS owns

- segmentation of messy messages into independent intents;
- grounding/provenance discipline;
- corrections vs new observations;
- missing-information questions;
- channel-neutral routing;
- selecting the canonical authority;
- selecting a permitted execution path based on the currently available trusted connector/runtime;
- replay-safe source-event identity when the chosen path requires it;
- delegation to domain Skills such as Gym Intelligence and Nutrition Intelligence.

### Domain Skills own

- domain semantics and structured payloads for their existing stores;
- correction semantics specific to that domain;
- domain-level validation that is not generic routing logic.

Examples: Gym Intelligence and Nutrition Intelligence should continue writing to their canonical
Google Sheets stores when ChatGPT has a trusted path to those stores. Their data should not be copied
into Vida merely so the Web can display it.

### Vida owns

- product-specific capabilities that actually exist in Vida;
- read models and derived views used by Vida Web;
- product-specific validation/policy where Vida owns the operation;
- Safe Writes adapters/runtime when they add needed authorization, audit, ownership, idempotency,
  compensation or rollback guarantees.

OpenClaw may become a channel executor/gateway, but it does not own these policies.

## Canonical authorities

| Information | Canonical authority |
| --- | --- |
| Areas, projects, tasks, operational content, Inbox | Notion |
| Gym history, nutrition, habits, health, sleep, productivity, quantitative derivatives | Google Sheets |
| Agenda and time blocks | Google Calendar |
| Heavy/original files and evidence when appropriate | Google Drive |
| Derived command-center views | Vida Web |

The conversational channel is never a source of truth.

## Vida capability registry

`lib/capture/contracts.ts` describes only capabilities implemented by the Vida Safe Writes substrate:

| Operation              | Canonical authority                      | Vida execution contract          |
| ---------------------- | ---------------------------------------- | -------------------------------- |
| `task.create`          | Notion Tasks                             | proposal-only                    |
| `task.change-status`   | Notion Tasks                             | proposal-only                    |
| `inbox.capture`        | Notion Inbox                             | proposal or scoped direct-apply  |
| `gym.session.create`   | Google Sheets Gym                        | proposal-only                    |
| `calendar.hold.create` | dedicated Google Calendar holds calendar | proposal-only                    |

This registry does **not** mean ChatGPT must use Vida for every write to those authorities. It only
describes the Vida-owned execution surface when that route is selected.

The registry deliberately does not duplicate risk/confirmation/reversibility values. Those remain in
the Safe Writes Policy Engine.

No control operation (`proposal.approve`, `proposal.reject`, `action.rollback`) is a semantic capture
intent.

## Nutrition and Gym boundary

Nutrition Intelligence and Gym Intelligence already implement the desired conversational behavior
against their own structured Google Sheets stores.

V1 must preserve that model:

```text
user message
-> ChatGPT
-> domain Skill
-> canonical Google Sheet
-> Vida Web reads/derives
```

Do not force those writes through `vida-2.0` merely to make all domains look uniform. A future Vida
bridge may expose a sanitized capability only if it adds a real product/safety benefit.

The same principle applies to future domains: route to the authority; do not copy the database.

## Existing Inbox direct-apply capability

`inbox.capture` has a narrow internal Vida direct-apply implementation created for a potential trusted
ChatGPT adapter. It remains useful as a safe fallback/executor for channels that cannot write to
Notion directly.

Its guarantees include:

- trusted transport identity;
- explicit user write intent;
- separate fail-closed feature flag;
- Safe Writes readiness;
- idempotent source-event handling;
- canonical Inbox validation;
- sanitized ledger evidence without storing the captured text;
- ownership + rollback deadline;
- immediate compensation when the provider write succeeds but the ledger cannot certify `applied`.

This is **technical capability, not a mandatory architecture path** and not Production activation.
`CONVERSATIONAL_INBOX_DIRECT_APPLY_ENABLED` remains off by default.

If ChatGPT has a trusted, authorized Notion write connector that can satisfy the intended Inbox/Task
contract directly, prefer that path instead of enabling a Vida API hop solely for transport.

## ChatGPT-first behavior

The useful behavior is:

1. user sends a messy but actionable message in ChatGPT;
2. PAS resolves one or more grounded intents;
3. only materially missing information is requested;
4. each intent is matched to its canonical authority/domain contract;
5. the applicable target policy is evaluated;
6. ChatGPT uses the smallest trusted write path currently available:
   - direct connector to Sheets/Notion/Calendar/Drive when sufficient; or
   - the relevant Vida Safe Writes capability when its extra guarantees are necessary;
7. successful independent intents are not repeated because another intent is blocked;
8. user receives a brief effect summary, not provider IDs or database mechanics;
9. Vida Web later reads and visualizes the canonical result.

## Example routes

```text
"hice jalón 60 kg: 8, 7 y 6"
-> Gym Intelligence -> Google Sheets Gym -> Vida Web

"comí 300 g de milanesa y una banana"
-> Nutrition Intelligence -> Google Sheets Nutrition -> Vida Web

"tengo que entregar Redes el jueves"
-> Conversational Capture -> Notion Tasks -> Vida Web

"martes 18 a 20 tengo fútbol"
-> Conversational Capture -> Google Calendar -> Vida Web
```

For Tasks/Calendar, the exact confirmation/approval behavior depends on the currently authorized
connector and the target operation policy. Do not infer auto-apply from this document.

## Channel progression

- **ChatGPT:** primary surface. Prefer its trusted direct connectors to canonical authorities when
  available and sufficient.
- **Telegram:** optional low-friction transport over the same semantic contract. It may use a Vida
  adapter/OpenClaw or direct provider integration depending on which path safely preserves the target
  contract.
- **WhatsApp:** later, only if it can preserve the same identity, idempotency, privacy and operational
  boundaries without disproportionate maintenance.

No channel-specific business routing.

## Non-goals

- no new database;
- no generic business-write endpoint;
- no forced ChatGPT -> Vida API hop;
- no generic `calendar.event.create` in Vida merely for transport;
- no automatic Journaling access;
- no automatic OpenClaw proposal activation;
- no Automations activation;
- no broad agent autonomy;
- no copying Nutrition/Gym raw history into Vida;
- no Production activation of the Inbox direct-apply gate solely because the code exists.

## Next implementation step

Validate the **ChatGPT -> canonical source** paths that already exist for Gym and Nutrition, then
extend the same model to Notion Tasks/Inbox and Google Calendar using the connected capabilities that
are actually available and safe.

Only build/activate a Vida adapter for a domain when direct source access is unavailable or when Vida
must provide a concrete missing guarantee such as scoped authorization, audit, idempotency, ownership
or rollback.
