# Phase F — integration QA gate (staged, not Production certification)

Observed baseline: Vida `main` at `76db052481c8fedc4a90344a41b9ee9f7b9b2044`, after merge #205. This document describes a bounded QA slice proposed on a separate review branch; it does not authorize flags, schemas, writes, or deployments.

## Scope and evidence

The first Phase F delta hardens Gregorian date handling across the read-only weekly view and task week selection. JavaScript `Date.parse` accepts some impossible dates by rolling them into a later month; this is unsafe for exams and obligations. Invalid day-only dates now remain **undated/unknown** (or excluded from task-week selection); they are never silently classified as an upcoming commitment. Existing valid `YYYY-MM-DD` date windows remain unchanged.

The regression tests cover invalid and valid leap days, invalid target dates, date-type pressure, and independent opt-in presentation gates. These are deterministic unit/integration checks, not observed authenticated UI E2E tests.

## Phase F coverage map

- **V1 fallback and flags:** exact-true independently fail-closed tests exist; effective deployed environment and authenticated V1 rollback remain unobserved.
- **Date semantics:** legacy tasks remain ambiguous and only true Deadlines are overdue; real Notion Date Type migration and web mutations remain separate approvals.
- **Week and assessments:** past/undated/future are distinguished; this delta rejects impossible Gregorian day rollovers. Authenticated responsive weekly UX is still unobserved.
- **Academic mastery:** Assessment Progress owns mastery; elapsed hours do not prove readiness. Multi-subject fresh-diagnosis QA is still pending.
- **Project evidence:** #205 evidence-only trajectory and duplicate-order tests passed; live permission and degraded-state QA remain pending.
- **Source failures:** orientation and planning context have isolated degraded-source tests; actual integration fault injection remains pending.
- **Journal privacy:** PAS defines D-1 scoped read, revocation and no raw text persistence; actual authorized revoke-path E2E and browser/store audit remain pending.
- **Whole-life reasoning:** canonical contract disallows a life score or moralizing leisure; representative transfer scenarios remain pending.
- **Habits:** #204 code tests passed but draft remains unmerged and non-atomic Google Sheets writes are not concurrent-write certified.
- **Accessibility and UI:** actual authenticated desktop/mobile, keyboard and screen-reader behavior remain to be observed.
- **Deployment:** V1 is published while V2 Production auto-builds are canceled. Phase G flag cutover and rollback rehearsal require separate authorization.

## Release boundaries

- Do **not** claim Phase F is complete because an isolated PR or build passes.
- Do **not** assume Vercel Preview renders authenticated real sources without observed E2E.
- `HABITS_V2_WRITES_ENABLED` remains absent/false. Google Sheets pre-read/PUT/read-back is not an atomic transaction.
- The existing PAS PR #483 migration plan and PR #484 state/handoff remain pending, separate from this code review branch.
- A protected-`main` merge requires independent explicit owner approval after exact-head, scope and Quality verification.
