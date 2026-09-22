# Vida 2.0 — Continuous Improvement Contract

## Ownership

Vida 2.0 is the implementation/UI repository.

The durable improvement runtime, technology decision memory and project improvement profiles live in:

`franciscovitar/personal-ai-system`

Canonical PAS entry points:

- `AI/core/CONTINUOUS_IMPROVEMENT_RUNTIME.md`
- `AI/projects/continuous-improvement/PROJECT_IMPROVEMENT_RUNTIME.md`
- `AI/projects/continuous-improvement/TECHNOLOGY_FIT_GATE.md`
- `AI/projects/vida-2/IMPROVEMENT_PROFILE.md`

Do not duplicate those rules here.

## Deep review trigger

A request equivalent to:

> Revisión profunda de mejora de Vida 2.0.

must read both repositories.

## Required evidence

Before proposing product/technical changes, reconstruct:

- current `vida-2.0/main`;
- Vercel/Production evidence where available;
- current tests and verification gates;
- current source ownership and write boundaries;
- relevant PAS state/decisions;
- user-reported UX friction and outcomes.

Then consult current Intelligence / Professional / Technology Library and fresh external evidence when material.

## Technology candidates

A technology/library entry is not an adoption instruction.

Candidates such as testing, observability, accessibility, security, analytics or DevEx tools must pass the PAS Technology Fit Gate:

- concrete current need;
- current-stack overlap;
- maintenance;
- license;
- security/privacy;
- compatibility;
- total incremental monetary cost;
- operational/maintenance cost;
- eval;
- rollback/exit.

Prefer already-paid, free/open-source or low-cost options when value is comparable.

## Source-of-truth invariants

Continuous improvement must preserve:

- Notion/Sheets/Calendar/PAS ownership where already defined;
- Vida as derived authenticated product/interface;
- no silent Production mock fallback;
- bounded/idempotent safe writes;
- private/auth boundaries;
- explicit failure states.

## Change process

For non-trivial changes:

1. review and candidate selection;
2. user approval where required;
3. non-protected branch/PR;
4. targeted tests;
5. `npm test` and `npm run verify` when relevant;
6. Preview/Production checks proportional to risk;
7. rollback path;
8. real-use outcome;
9. durable outcome routed back to PAS/Professional when it teaches future decisions.

`NO_CHANGE` is valid.

## Scope guard

Vida should become simpler, more useful, safer and easier to operate.

Do not add modules merely because a new tool/framework exists. New product domains should go through bounded project decisions rather than turning the web shell into an unlimited scope container.
