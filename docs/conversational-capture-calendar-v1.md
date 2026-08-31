# Conversational Capture — Calendar V1

## Goal

Let the user operate Google Calendar from natural conversation without opening Vida Web or filling a Calendar form.

Calendar remains the canonical authority for real agenda/time commitments. Vida Web only reads and composes Calendar state.

This document is a concrete domain contract under ADR 0006 and `docs/conversational-capture-v1.md`.

## Reference flow

```text
user message
-> ChatGPT / future Telegram / future WhatsApp
-> PAS Conversational Capture
-> resolve calendar intent + ambiguity
-> direct trusted Google Calendar connector when sufficient
   OR Vida Safe Writes when its additional guarantees are actually required
-> Google Calendar
-> verify durable effect
-> Vida Web reads/derives
```

The channel and Vida Web are not sources of truth.

## Canonical calendar choice

### Confirmed real event or deliberate time block

Default destination: the user's **primary Google Calendar**.

Examples:

```text
"El martes de 18 a 20 tengo fútbol"
"Agendame dentista el viernes de 16 a 17"
"Bloqueame mañana de 10 a 12 para estudiar Redes"
```

When date/time are sufficiently grounded and the user is clearly asking to create the event/block, the operation may write directly to the primary Calendar if the current connector/policy permits it.

### Dedicated tentative/dev calendar

`Vida 2.0 DEV — Tentativos` is **not** the default destination for normal personal events.

It remains a secondary calendar for explicit tentative/dev/hold workflows when that workflow is deliberately selected and authorized.

Do not silently put real commitments there merely because the calendar exists.

## Calendar vs Task

A date does not automatically make something a Calendar event.

### Route to Notion Tasks when

- it is a next action or deadline without a real reserved time;
- the user says something like `tengo que entregar el informe el jueves`;
- the date is useful task metadata but no real block/appointment is intended.

Example:

```text
"Tengo que entregar Redes el jueves"
-> Notion Tasks, Fecha=Thursday
```

Do **not** duplicate it into Calendar unless the user also wants a real time block/event.

### Route to Calendar when

- there is a real appointment/meeting/class/match/commitment with time;
- the user explicitly says `agendame`, `ponelo en el calendario`, `bloqueame`, or equivalent;
- a deliberate focus/time block is the requested durable effect.

Example:

```text
"El martes de 18 a 20 tengo fútbol"
-> Google Calendar only
```

## Grounding rules

Persist only what was supplied or safely resolved from current context/canonical state.

Never invent:

- date;
- start time;
- end time/duration;
- attendees;
- location;
- recurrence;
- reminder policy;
- Google Meet;
- event type;
- title details that change meaning.

Unknown remains unknown until the write contract has enough information.

## Minimal questions

Ask only when the answer materially changes the durable event.

Typical blockers:

- more than one plausible date;
- ambiguous AM/PM when context cannot resolve it;
- start time known but end time/duration is required and no stable default exists;
- several existing events could be the correction/deletion target;
- recurrence scope is unclear.

Do not ask for optional metadata such as color, description, location or reminder merely because Calendar supports them.

## Creation defaults

For a normal personal event created from conversation:

- no attendees unless explicitly supplied;
- no Google Meet unless explicitly requested;
- no recurrence unless explicitly requested/resolved;
- no attachments unless explicitly requested;
- no guest-edit permission unless explicitly requested;
- use the canonical Vida timezone (`America/Argentina/Cordoba`) when a timezone is needed and no event-specific timezone was supplied;
- use the user's primary Calendar for confirmed real events unless another calendar is explicitly intended.

Do not fabricate duration. If an end time is required and cannot be resolved, ask one compact question.

## Corrections

A follow-up correction should update the existing event when the referent is unambiguous.

Example:

```text
Turn 1: "Agendame dentista el viernes de 16 a 17."
Turn 2: "Me equivoqué, es a las 17."
```

Expected:

- find/read the existing event in a bounded time window;
- update that event;
- do not create a second event;
- verify the new time afterward.

If more than one event is a plausible target, ask one compact clarification before mutating either.

## Duplicate protection

The direct ChatGPT connector does not itself expose a domain idempotency key.

Before creating a conversational event when duplicate risk is meaningful:

1. search a bounded time window around the intended date/time;
2. look for the same real-world event, not merely similar text;
3. if an exact existing event is found, do not create another;
4. if identity is uncertain, ask rather than silently merge.

Content similarity alone is not identity.

For Telegram/WhatsApp retries, use an execution path that can preserve a stable source-event idempotency identity when direct Calendar tooling cannot do so safely.

## Deletion

Deleting/canceling an event is destructive and requires an explicit current user request.

Before deletion:

1. resolve/read the exact target event;
2. ask if multiple plausible events remain;
3. delete only the resolved event;
4. verify absence afterward when practical.

Never infer deletion from `ya no voy`, `capaz no`, or other ambiguous conversational context unless the user clearly instructs the system to remove/cancel the Calendar event.

## Recurring events

Recurring-series mutations require explicit scope when it is not already clear:

- this occurrence only;
- this and following;
- entire series.

Never modify an entire recurring series because one occurrence was discussed.

## Multi-intent messages

Calendar intents remain independent from other domain writes.

Example:

```text
"Mañana tengo fútbol de 19 a 21 y hoy hice 40 min de bici zona 2"
```

Expected:

- football commitment -> Google Calendar;
- completed bike session -> Gym Intelligence -> canonical training Sheet;
- successful independent writes are not repeated because another intent needs clarification.

## Direct connector vs Vida Safe Writes

Prefer direct Google Calendar execution when:

- the conversational intent is grounded;
- current user authorization is explicit enough for the requested event operation;
- the connector can perform the exact operation with acceptable verification;
- no extra product-level guarantee is materially required.

Prefer a Vida Safe Writes path when it contributes a guarantee the direct path cannot adequately preserve, such as a specialized hold workflow, stronger ownership/rollback semantics or channel-level replay protection.

Do not force every event through Vida merely for architectural uniformity.

## Vida Web behavior

Vida Web should:

- read Calendar;
- compose upcoming commitments into derived views;
- use time context for planning/interpretation;
- avoid becoming a second Calendar store;
- avoid requiring a Calendar creation form for normal use.

A manual Calendar form may exist only as an exceptional/admin/debug surface if it provides real value; it is not the normal product interaction.

## Verification and acknowledgement

Never say an event was saved/changed/deleted unless the real provider operation succeeded.

After a successful effect, respond briefly, for example:

```text
Listo, quedó agendado el martes de 18 a 20.
```

Do not expose provider event IDs or internal calendar identifiers in normal UX.

## Current operational capability snapshot

As of 2026-08-31, the connected ChatGPT Google Calendar capability was observed to support:

- listing/searching/reading calendars and events;
- creating events;
- updating existing events;
- deleting events.

This is operational evidence, not a permanent product guarantee. Revalidate connected capabilities before relying on them after tooling/account changes.

The observed calendar list includes:

- an owned primary personal calendar;
- an owned secondary `Vida 2.0 DEV — Tentativos` calendar.

No write was performed merely to certify this document.

## V1 success criteria

Calendar Conversational Capture V1 is successful when:

1. the user can describe a real event naturally;
2. only decision-relevant ambiguity is queried;
3. confirmed events go to the canonical real Calendar rather than Vida Web;
4. date-only actions remain Tasks unless a real Calendar effect is intended;
5. corrections update instead of duplicate;
6. destructive removal is explicit and scoped;
7. no attendees/Meet/recurrence/duration are invented;
8. durable success is claimed only after provider verification;
9. Vida Web simply reflects the resulting Calendar state.
