# Conversational Capture — Notion Tasks/Inbox V1

## Purpose

Define the first non-domain conversational capture slice after validating Gym Intelligence as the
reference behavior.

The user should be able to write naturally in ChatGPT without opening Vida Web, choosing a database
or filling a form. ChatGPT interprets the message and writes to the canonical Notion authority when
the intent is clear and the connected Notion capability is authorized.

Vida Web remains a derived reader/command center.

## Reference pattern: Gym Intelligence

Gym Intelligence is the reference implementation because it already demonstrates the desired split
between conversation, canonical observations and durable project intelligence.

A single conversation can produce different persistence effects without forcing them through one
store:

1. **Observed execution** — completed sessions and sets are written to the canonical Google Sheets
   training store.
2. **Stable program change** — changes to the planned routine are written to the canonical Notion
   routine.
3. **Durable reusable decision/rule** — stable coaching/program rules may be persisted in PAS/GitHub
   project state so future chats do not depend on conversational memory.
4. **Derived analysis** — comparisons and weekly reviews read the canonical history; they are not
   copied back as raw observations.

This yields the reusable pattern:

```text
natural message
-> segment independent intents
-> resolve canonical authority for each intent
-> write each fact/decision once to its owner
-> verify the real write
-> analyze from canonical history
-> return a short confirmation/decision
```

Do not create a single mega-store merely because several intents arrived in one message.

## Current Notion authorities

### Tasks

Canonical authority: Notion database `✅ Tareas`.

A task represents one visible, concrete next action.

Current fields include:

- `Tarea`
- `Estado`
- `Prioridad`
- `Proyecto`
- `Área`
- `Fecha`
- `Duración estimada`
- `Energía requerida`
- `Bloqueo`
- `Nota`

The existence of a field does not mean conversational capture must populate it.

### Inbox

Canonical temporary authority: Notion page `02 — Bandeja de entrada`.

Inbox exists for information that is intentionally not processed enough yet to choose a permanent
module. It should remain a simple low-friction holding area, not another permanent database.

## Routing rule

### Route to Tasks when

The user has expressed a clear next action.

Examples:

```text
"tengo que mandar el presupuesto a Juan"
-> Tasks

"el jueves tengo que entregar Green Software"
-> Tasks + explicit date

"acordame revisar el hero de la web de Mauricio"
-> Tasks
```

A clear `tengo que`, `hacer`, `mandar`, `revisar`, `comprar`, `llamar`, `entregar` or equivalent
imperative/action statement normally counts as explicit capture intent when the surrounding context
is not hypothetical.

Do not ask the user to say `guardalo` again merely to add a redundant confirmation for a low-risk
reversible creation when the current connector/policy already permits the write.

### Route to Inbox when

The content matters but its permanent destination or next action is not yet clear.

Examples:

```text
"idea: capaz ofrecer auditorías de WhatsApp a clientes"
-> Inbox

"anotar: investigar lo del pasaporte, todavía no sé qué tengo que hacer"
-> Inbox
```

Do not force an Inbox capture into Tasks merely to make the system look organized.

### Consider a Project when

The user describes an observable result that clearly requires multiple actions rather than one next
action.

Do not silently invent a full project plan from a vague sentence. If the result is clear but the next
action is not, capture the thought safely or ask only the question required to choose the correct
owner.

## Minimal task write contract

For a new clear task:

- `Tarea` — required; normalize into a concrete action title when semantics are clear.
- `Estado` — default to `Pendiente` for a newly captured actionable task unless the user explicitly
  says otherwise.
- `Fecha` — write only when explicitly provided or reliably resolved from current conversational
  context.
- `Proyecto` / `Área` — write only when explicitly supplied or reliably resolved from canonical
  context. If a project relation is used, preserve its canonical area relationship rather than
  inventing another area.
- `Prioridad` — leave unset unless the user explicitly supplies it or a current authoritative rule
  makes the value deterministic.
- `Duración estimada` — leave unset unless the user supplies it or explicitly asks for an estimate.
- `Energía requerida` — leave unset unless deliberately supplied/derived for a decision-relevant
  reason.
- `Bloqueo` — write only when the user reports a real blocker.
- `Nota` — use only for material context that should remain attached to the task; do not copy the
  whole chat.

Unknown is empty, not a guessed value.

A polished task title may be derived from the user's wording when it preserves meaning. Do not invent
a different scope merely to make the title sound more productive.

## Low-friction rule

Do not turn capture into a questionnaire.

Ask only when the missing answer can change the durable result, for example:

- two plausible dates would create materially different deadlines;
- two existing projects could both be the intended owner;
- the sentence is too vague to identify a concrete action;
- it is unclear whether the user is describing a real commitment or discussing a hypothetical.

Do not ask for optional priority, energy, duration, notes or categorization by default.

## Multi-intent messages

Segment before writing.

Example:

```text
"mañana mandar el presupuesto a Juan y hoy hice jalón 65 kg 8/6/5"
```

Expected routing:

```text
intent 1 -> Notion Tasks
intent 2 -> Gym Intelligence -> Google Sheets Gym
```

A failure or ambiguity in one independent intent must not force the user to repeat the other
successful intent.

## Corrections and referents

A follow-up such as:

```text
"eso era para el viernes"
"ponelo en el proyecto de Baterías Sur"
"no, eran 30 minutos"
```

should first resolve whether it refers to the immediately preceding durable item.

If the same item can be identified safely, update it instead of creating a duplicate. If two
plausible items exist, ask a compact clarification before mutating either one.

Do not use content similarity alone as proof that two identical-looking tasks are the same real-world
action.

## Persistence acknowledgement

Mirror the Gym Intelligence standard:

- if the real Notion write succeeds, say it was saved;
- if no write happened, do not imply persistence;
- if the provider write fails, report that clearly and preserve the smallest useful recovery context;
- do not expose provider IDs or internal ownership tokens in the normal confirmation.

## Safety and authorization

Creation of a clear low-risk task or Inbox capture may use the trusted direct Notion connector when
current authorization permits it.

This does not weaken the existing explicit-authorization rules for destructive or structural
operations. Deleting content, archiving full pages, merging pages or changing system architecture
continues to require explicit recent authorization.

If authorization/readiness cannot be verified, fail closed rather than pretending the item was
saved.

## Idempotency

The preferred future channel contract carries an opaque source-event key so retries cannot duplicate
a write.

For ChatGPT direct connector usage, do not invent a fake provider event ID. Keep each tool mutation to
one deliberate execution after intent resolution and verify the created result before claiming
success. If a connector/runtime cannot provide adequate replay protection for a flow that may retry
automatically, route through a capability that can provide idempotency rather than adding a hidden
mirror database.

Telegram/WhatsApp adapters must provide stable channel event identity before unattended direct apply.

## First live validation

Do not create synthetic Production tasks merely to prove the connector works.

The first end-to-end validation should be the next genuine user capture that naturally belongs in
Tasks or Inbox:

1. resolve the intent from the real message;
2. read only the minimum canonical context needed;
3. write once to the real canonical Notion authority;
4. verify the result;
5. confirm briefly;
6. confirm Vida Web can read it only when that verification becomes relevant.

No Vida Web form is part of this validation.

## Success criteria

This slice is successful when:

- the user can state a task/idea naturally;
- ChatGPT chooses Tasks vs Inbox without asking the user to choose a module;
- only grounded fields are persisted;
- a clear task does not trigger an optional-metadata questionnaire;
- the actual Notion write is verified before persistence is claimed;
- Vida Web remains a read/analysis surface;
- no extra database, queue or proxy is introduced solely for transport;
- later Telegram/WhatsApp channels can reuse the same semantic routing contract.
