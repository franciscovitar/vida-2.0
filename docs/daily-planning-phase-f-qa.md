# Phase F — integration QA gate (staged, not Production certification)

Observed baseline: Vida `main` at `76db052481c8fedc4a90344a41b9ee9f7b9b2044`, after merge #205. This document describes a bounded QA slice proposed on a separate review branch; it does not authorize flags, schemas, writes, or deployments.

## Scope and evidence

The first Phase F delta hardens Gregorian date handling across the read-only weekly view and task week selection. JavaScript `Date.parse` accepts some impossible dates by rolling them into a later month; this is unsafe for exams and obligations. Invalid day-only dates now remain **undated/unknown** (or excluded from task-week selection); they are never silently classified as an upcoming commitment. Existing valid `YYYY-MM-DD` date windows remain unchanged.

The regression tests cover invalid and valid leap days, invalid target dates, date-type pressure, and independent opt-in presentation gates. These are deterministic unit/integration checks, not observed authenticated UI E2E tests.

## Phase F coverage map

| Area | Gate | Evidence currently available | Remaining evidence before closure |
| --- | --- | --- | --- |
| V1 fallback and flags | All V2 UI flags exact-true, independently fail closed | Existing component tests + Phase F cross-module regression | Verify effective deployed env values; authenticated V1 rollback |
| Date semantics | Only real Deadline becomes overdue; legacy stays ambiguous | Existing Task Date tests + Phase F mixed-date regression | Production Notion schema migration approval and actual date-type read/write E2E |
| Week and assessments | Past/undated/future separate, invalid civil dates never normalized | E7 pure tests + new Gregorian read-side regression | Authenticated responsive week UX on current canonical academic evidence |
| Academic mastery | No readiness from elapsed hours alone | Orientation and Assessment Progress contracts/tests | Fresh multi-subject diagnosis, professor-specific evidence and live reconciliation |
| Project evidence | No percentage, closure or next milestone invented | #205 projection tests; duplicate milestone order fails closed | Live Projects/Milestones source permission/degraded-state QA |
| Source failures | Missing Notion/Calendar/Gym/assessment states fail closed | Existing degraded-source and V2 orientation tests | End-to-end fault injection, unavailable-vs-empty distinctions, retry observation |
| Journal privacy | D-1 scope and revocation; no raw text leakage | PAS runtime contract; V2 browser ref stripping tests | Authorized bounded D-1 access / revoke-path E2E and browser/store payload audit |
| Whole-life reasoning | No life score; no screen-time moralization | PAS runtime contract | Realistic non-displacement/leisure and exhausted-day scenarios |
| Habits | Registry/Log lineage, derived Gym and historical edits | PR #204 isolated tests only (unmerged draft) | Serialized/fenced authority, cross-instance write races, ambiguous failure, crash/replay QA, schema authorization |
| Responsive/accessibility | Collapsible details and mobile focus/navigation | Isolated page components, build and previews | Actual authenticated desktop/mobile keyboard and screen-reader checks |
| Deployment/rollback | V1 remains public until owner-approved V2 rollout | Post-merge Vercel Production builds canceled, old READY aliased | Phase G explicit flags, migrations, E2E, rollback rehearsal and consent |

## Release boundaries

- Do **not** claim Phase F is complete because an isolated PR or build passes.
- Do **not** assume Vercel Preview renders authenticated real sources without observed E2E.
- `HABITS_V2_WRITES_ENABLED` remains absent/false. Google Sheets pre-read/PUT/read-back is not an atomic transaction.
- The existing PAS PR #483 migration plan and PR #484 state/handoff remain pending, separate from this code review branch.
- A protected-`main` merge requires independent explicit owner approval after exact-head, scope and Quality verification.
