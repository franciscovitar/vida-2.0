# University Study Catalog

`/aprendizaje/estudio` is the learner-facing catalog for the active university subject modules.

## Authority

The catalog does not become a new academic source of truth.

- subject identity, current focus, assessment structure, concepts/families and learner-state metadata: canonical PAS `main` under `AI/projects/university/subjects/<id>/`;
- assessment progress/readiness percentage shown in Vida: existing `Assessment Progress` source;
- Study Engine attempts/FSRS: Study Engine runtime;
- mastery/readiness interpretation and next-best activity: Learning OS.

The catalog is read from private PAS `main` on the server. Vida does not keep a derived academic snapshot in this public repository. If private GitHub access is unavailable, the catalog is unavailable rather than falling back to stale academic data.

## Live source

Server-side Vida reads an explicit allowlist of subject files from private PAS `main`. Each request resolves the current `main` commit once and pins all contents reads to that immutable SHA. Requests are uncached (`no-store`) and no repository payload or credential is logged or passed to a public cache.

The existing least-privilege read-only token is used:

```text
UNIVERSITY_CATALOG_GITHUB_TOKEN
```

The repository and branch are fixed in the reader to `franciscovitar/personal-ai-system` / `main`.

For backwards-compatible low-friction rollout, `ENGLISH_PROFILE_GITHUB_TOKEN` may be reused as a fallback when it already grants read-only Contents access to the same private repository.

No token or raw repository object is exposed to client code. Pages require an authorized session. Without a token, Vida shows an unavailable state and does not use a public academic fallback.

The authenticated `/aprendizaje/capacidades` library uses the same reader and token. Its allowlist is limited to the inventory, curated cards, generic time estimates and engine routing JSON files under `AI/knowledge/personal/`. Only the 12 cards marked `CURATED_V1` receive full descriptions. The 245-item inventory remains optional; requesting a learning route never activates it.

For a later Vida QA connection, configure the existing `UNIVERSITY_CATALOG_GITHUB_TOKEN` on the Preview environment with GitHub Contents read access limited to `franciscovitar/personal-ai-system`. An already configured `ENGLISH_PROFILE_GITHUB_TOKEN` with that same minimum access can be reused. No new credential is required by this implementation.

## Subject hierarchy

The read model is:

```text
Subject
  -> Assessment
  -> Topic / block / unit
  -> Study sets / mazos when explicitly present
  -> Concepts / families
```

Derivation rules are conservative:

- explicit `families` in the Concept Inventory become topics;
- explicit concept `block` values become topics and use Blueprint labels when available;
- Blueprint scope is a fallback topic list;
- numbered study files become bounded study sets/mazos;
- missing structure stays `unresolved`; Vida renders “sin medir / estructura pendiente”, never a fake 0%.

## Current 2026 rollout

PAS currently exposes seven active subject modules:

- Ciencia de Datos;
- DAO;
- Diseño de Sistemas de Información;
- Green Software;
- IOP;
- Redes;
- TPA.

IOP and Redes already have rich machine-readable scope. DSI has useful practice-set structure but incomplete canonical Concept Inventory. CDD, DAO, Green and TPA remain visible while their assessment structure is unresolved.

## Real subject Study Engine sessions

A subject may expose a real Study Engine session only when PAS contains:

```text
AI/projects/university/subjects/<subject-id>/learning/study_engine_items_v1.json
```

That file is canonical intelligence in PAS. Vida loads and validates it server-side; it does not become a second question-bank authority. The catalog shows **Empezar sesión** only when that canonical runtime file exists.

Study Engine content remains read from its exact canonical runtime path. It is intentionally a seed for end-to-end evidence validation, not a comprehensive exam bank.

Real subject attempts reuse the same offline-first outbox and FSRS event contract as the demo. Persistent browser history is consulted before each attempt so an item already answered on the same device is not silently relabeled as fresh after a page reload.
