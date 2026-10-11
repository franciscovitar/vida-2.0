# Phase F — read-only QA configuration gate

This gate prepares **Hoy, Planificación/Semana, Materias/Aprendizaje and Proyectos**
for a bounded, authenticated V2 QA in **Preview `vida-qa` only**. It does not change
configuration, enable flags or grant access to external sources.

## Current source reconciliation

- The 24 files in PR #220 are byte-identical to the corresponding files in
  `vida-qa` at `f7babbd50c43b4d9b7a175592891d5eae412dd69`. Do **not**
  replay them over this branch or conflate the PR's green CI with live E2E.
- Calendar OAuth has been renewed in Google Production; a new read-only token
  was placed into Vercel Preview `vida-qa`. Authenticated Agenda showed
  `Fuente: Google Calendar` and six events after one READY redeploy.
  This is Calendar success evidence, not certification of V2 surfaces.
- Phase E7/Semana code is already merged; Phase F integration and user-visible
  V2 activation remain unverified.
- Habits V2 PR #204 stays separate: multi-writer Google Sheets writes are not
  concurrency-certified. This gate must keep its V2 UI/writes disabled.

## Deterministic configuration check

Run in a controlled environment with the **effective** `vida-qa` Preview
configuration and `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=vida-qa`:

```bash
npm run phase-f:check
```

The script prints only fixed check names and PASS/BLOCKED; it never prints
secret values, calls Google/Vercel or modifies deployment configuration.
It requires the four V2 presentation flags to be explicitly enabled,
Calendar/Sheets/Notion real modes with Sheets target `dev`, and all
advanced write/Habits V2/task-date/agent gates disabled.

Do **not** create an artificial environment locally and interpret PASS as
evidence of deployed Preview configuration. If the effective values cannot be
read safely or the flags cannot be verified, record **NOT VERIFIED**.

## Separate authenticated acceptance evidence (not automated by this check)

1. Confirm authenticated `/hoy` shows V2 Atención hoy / Ayer / Próximamente /
   Vida-capacidad with truthful unavailable states, not invented free time.
2. Confirm `/planificacion` displays Revisión / Prioridades / Semana / Acciones,
   with real Tasks, Projects/Hitos, current assessments and Calendar.
3. Confirm `/aprendizaje` and the study catalog show **subject-specific**
   evidence and distinguish unmeasured readiness from unavailable sources.
4. Confirm `/proyectos` shows only milestone-backed progress and justified E6
   signals; no fabricated progress or ETA.
5. Confirm `/agenda` still shows real Calendar; independently exercise
   source failure/degraded states without exposing credentials.
6. Check responsive/mobile, keyboard navigation, privacy/Journaling boundaries
   and return-to-V1 behavior. Journal D-1 reads require separate explicit consent.
7. Preserve Habits V1. Do not enable `HABITS_V2_WRITES_ENABLED` or merge #204
   until fenced/serialized write correctness is demonstrated.

**QA PASS is not a Production release authorization.** Phase G requires an
independent decision, observed rollback, and per-environment release checks.
