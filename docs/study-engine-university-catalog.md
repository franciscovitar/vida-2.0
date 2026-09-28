# University Study Catalog

`/aprendizaje/estudio` is the learner-facing catalog for the active university subject modules.

## Authority

The catalog does not become a new academic source of truth.

- subject identity, current focus, assessment structure, concepts/families and learner-state metadata: canonical PAS `main` under `AI/projects/university/subjects/<id>/`;
- assessment progress/readiness percentage shown in Vida: existing `Assessment Progress` source;
- Study Engine attempts/FSRS: Study Engine runtime;
- mastery/readiness interpretation and next-best activity: Learning OS.

A generated fallback snapshot in `data/generated/university-study-catalog.json` is presentation cache only. It carries the PAS source commit and must never be edited as if it were canonical subject knowledge.

## Live source

Server-side Vida attempts to read the private PAS repository with a least-privilege read-only token:

```text
UNIVERSITY_CATALOG_GITHUB_TOKEN
UNIVERSITY_CATALOG_GITHUB_REPOSITORY=franciscovitar/personal-ai-system
UNIVERSITY_CATALOG_GITHUB_REF=main
```

For backwards-compatible low-friction rollout, `ENGLISH_PROFILE_GITHUB_TOKEN` may be reused as a fallback when it already grants read-only Contents access to the same private repository.

No token is exposed to client code.

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

The first bounded rollout is DSI P2 with three ACTIVE_U3 items mapped to existing ConceptInventory IDs. It is intentionally a seed for end-to-end evidence validation, not a comprehensive exam bank.

Real subject attempts reuse the same offline-first outbox and FSRS event contract as the demo. Persistent browser history is consulted before each attempt so an item already answered on the same device is not silently relabeled as fresh after a page reload.
