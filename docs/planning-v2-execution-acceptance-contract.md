# Planning V2 — proposed offline acceptance contract

Status: **OFFLINE ONLY / SHADOW_READ_ONLY**. This design registers no capability
and authorizes no write. PAS remains the canonical owner of domain policy and
observation identity. This note describes the bounded implementation proposal.

## Product and authority

The preferred experience stays ChatGPT-first: a natural report is normalized and
routed through an authenticated integration, with the applicable standing opt-in.
No form, manual copying or per-message visit to Vida is part of that product path.
Auth.js is an alternative for certifying an explicitly approved DEV acceptance;
it is neither mandatory for ChatGPT nor proof of an earlier ChatGPT message.

An authenticated provider principal, its mapping to the allowed domain actor,
an authenticated source event, domain consent and permission for one concrete
write are separate facts. None may be inferred from natural-language assertions,
tool availability, a model-generated hash, a configured credential or synthetic
HMAC. Existing issuer/session and writer guards remain unchanged and unconnected.

## Minimum internal binding

The proposed scope is `planning-execution-v2:append:dev`, currently offline only.
The binding relates an opaque mapped actor key, this operation, the canonical
Observation ID, SHA-256 of the exact 17-cell row, an opaque DEV workbook key and
an independently scoped repetition key. The row digest uses the existing issuer
representation, `JSON.stringify(['execution', row])`. Acceptance freezes the
entire row, including its recording timestamp; a retry must not regenerate it.

Required evidence is resolved by a future independently verified adapter:

- authenticated authority/subject and explicit mapping to the domain actor;
- exact DEV destination, independently distinct from Production;
- a stable authenticated acceptance receipt per normalized intent;
- original event identity when actually available, never invented;
- an applicable current standing opt-in or explicit acceptance, bound to the
  same actor, operation, row digest, destination and repetition identity;
- complete, appropriately scoped event/observation association evidence.

Keys in this proposal are opaque SHA-256 references for internal comparison.
Hashing does not authenticate their source. Raw messages, provider IDs, emails,
credentials and Journal bodies are not receipt fields or diagnostic outputs.

## Two routes, one domain contract

**Preferred: ChatGPT integration.** The adapter verifies the integration's
authentication, resolves the actor, retrieves host/executor event evidence and
evaluates the current standing consent without a new questionnaire for every
clear report. A stable executor receipt is still required if the original host
event ID is unavailable. It must survive retries and distinguish multiple intents
in one message; neither the model nor this validator may mint it. A current
provider profile alone does not supply that receipt or the mapping to Vida.

**Alternative: Auth.js DEV.** The existing real server session resolves the actor.
An explicit acceptance binds the exact candidate and DEV target. Its source is
the authenticated Vida acceptance, and original ChatGPT event identity is absent.
The adapter must not label it as an authenticated ChatGPT invocation. No UI,
Server Action, endpoint or Auth.js-to-ChatGPT bridge is implemented by this slice.

## Event identity, replay and canonical observation identity

The repetition key scopes the operation to authority, subject, mapped actor,
DEV target, route, optional source event and stable per-intent acceptance receipt.
It excludes the row digest so altered content cannot silently become another
execution of the same acceptance. Exact replay requires the entire same binding.

The canonical Observation ID is unchanged. Two distinct real activities with
identical fingerprint inputs on the same day can share that ID. A second event
must therefore be treated as **ambiguous**, not silently counted as replay or
appended with an invented time/suffix. A genuinely reported different start can
disambiguate under the existing contract. If no grounded distinguishing field
exists, a canonical PAS identity decision is required before supporting the case.

Material corrections remain append-only in PAS, with explicit prior-observation
lineage. The current inert constructor cannot represent that complete authority.
This slice blocks corrections and never converts them to new observations or
overwrites. Correction support requires its own approved canonical adaptation.

## Implementation and limits

`checkPlanningV2ExecutionAcceptance` checks schema and binding consistency only.
It returns `consistent-offline`, `replay-offline` or `blocked`, always with
`writeAuthorized: false`. Even coherent forged fixtures cannot create permission.
No output is an acceptance token, persisted report, replay completion or writer
grant. There are no live callers, new flags, credentials or dependencies.

The history input is a bounded evidence snapshot, not a new store or a promise
that a lookup is authoritative/atomic. Its adapter must establish completeness
for the event OR observation in the DEV target, freshness and safe concurrent
handling. Current Firestore records contain kind/digest/dispatch state; they do
not yet prove event, actor or consent associations. Do not silently extend them
or connect this snapshot to synthetic data in a live writer.

Firestore's existing create/CAS guards can coordinate at-most-one dispatch among
participating writers. They do not make the acceptance-history check atomic or
commit atomically with Sheets. A dispatched/unknown result must not be resent;
confirmation still requires the existing complete read-back/reconciliation path.

## Next executable gate

Verify a ChatGPT integration's authenticated principal-to-actor mapping, stable
per-intent acceptance receipt across retries, available original event evidence,
current consent decision and authoritative event/observation lookup. Use only
sanitized boolean evidence, without a Sheets/Firestore write. If that capability
is absent, specify the smallest authenticated integration adaptation before any
implementation or provisioning. Auth.js may separately certify a DEV canary,
but cannot substitute for this ChatGPT-first product gate.

Only after those bindings and exclusive writer/recovery behavior are certified,
and exact runtime destinations are revalidated, request separate authorization
for one bounded synthetic DEV canary. The current slice activates nothing.
