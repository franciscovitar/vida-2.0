# Professional Visual Intelligence — Gate 0 / Evidence Readiness

Date: 2026-10-10. Status: IMPLEMENTATION IN PROGRESS, CONTRACT ONLY. No graphs,
snapshot publishing, deployment, source writes or user-facing behavior are enabled.

## Canonical source of truth

PAS documents under AI/projects/professional-intelligence:
- PROFESSIONAL_VISUALIZATION_ARCHITECTURE_V1.md
- PROFESSIONAL_VISUALIZATION_CATALOG_V1.json
- VIDA2_PROFESSIONAL_VISUALIZATION_DESIGN_V1.md

Reference PAS main at start: 08ae01c509111438cb77f0f9582b9966013ae4a2.
Vida main at start: a745c88fc47085b848354720f21ac8078b579c84.

## Evidence readiness for Gate A

| Module | Source | Readiness | Required guard |
| --- | --- | --- | --- |
| V02 growth % and net additions | PAS LABOR_MARKET_CURRENT_V1, US BLS 2025–35 | Source ready, transformation NOT implemented | US occupation code, period, rates and job counts separate |
| V03 annual openings | Same US BLS source | Source ready, transformation NOT implemented | Openings include replacement jobs; never proxy LATAM |
| V04 salary by seniority | PAS Professional snapshot / Sysarmy OpenQube 2026.01 | Historical PARTIAL only | ARS monthly gross, seniority, dollarization, n; review before current decisions |
| V13 skills vs proof | PAS Role Market Comparison / Personal Evidence Graph | Partial; HOLD full matrix | Counts do not imply skill mastery; missing facet-level mapping |

Existing Vida derivatives:
- data/generated/professional-snapshot.json: three US benchmark occupations,
  four salary role groups, five growth priorities and a broad forecast summary.
- data/generated/professional-market-detail.json: nine roles with demonstrated /
  practiced counts, but missing a defensible full requirement-by-facet grid.
- data/generated/ai-career-resilience.json: eleven role scenarios at Y1, Y5,
  Y10, Y20, with uncalibrated scenario ranges / heuristic indices, not
  job-loss probabilities.

## Other module readiness

- V01, V05, V06, V07, V08, V11: need deduplicated, methodologically
  comparable Job Search samples, query provenance and consistent windows.
  Do NOT extrapolate total Argentina/LATAM labor-market vacancies.
- V09, V10: 14 AI offers have official plan/limit evidence, but no controlled
  task-specific comparative success/cost evals. Hold performance ranking.
- V12, V14, V15, V16, V17, V19: qualitative/partial canonical inputs exist;
  require normalized derivation and UI guardrails before claiming quantitative
  comparisons. V16 is explicitly heuristic, not probabilistic.
- V18: no validated task-level automation dataset. HOLD.

## Gate 0 code

lib/professional/visualization-contract.ts defines:
- stable IDs V01–V19; explicit panel status with unavailable reasons;
- PAS commit, canonical refs and source identity;
- source-kind/observation date/review trigger;
- metric semantics, units, geography, period, role, occupation code,
  seniority, dollarization, sample size and source identity;
- fail-closed structural validation and a strict comparison gate.

It does NOT generate, aggregate, store or publish any numerical data.
No production visual snapshot is created in this gate, and the UI is unchanged.
The initial numeric subset covers official US projections V02/V03 and historical
Argentina workforce salaries V04. It intentionally does not assign fabricated
future employment/AI scores.

## QA achieved and outstanding

Locally exercised the isolated code:
- 13 focused unit tests passed using Node 22 TypeScript strip support;
- strict TypeScript single-module check passed.

Still required in real Vida checkout BEFORE merge:
- npm test, npm run check, npm run build;
- actual repo lint/Prettier/style/accessibility review;
- readback of branch diff and review of source-to-derivative implementation.

These focused checks do not establish a full Vida CI/build PASS.

## Next bounded action

1. Repo-aware agent checks this PR against actual Vida checkout and runs tests,
   formatting and build locally. No repeated metered Preview debugging.
2. Produce a PAS-authorized, sanitized, provenance-pinned derivative for
   actual BLS 2025–35 figures (V02/V03), with numeric units and occupation IDs.
   Connect through existing authorized Vida server loader, NOT the browser.
3. Implement the accessible, mobile-friendly paired bars and annual openings
   panels under /professional/mercado; state US_BENCHMARK prominently.
4. V04 historic salary visualization and V13 qualitative proof matrix follow
   after separate evidence readiness gates.
5. Merge protected branch and deploy only after required approval and QA.

Do not alter the five existing scheduled tasks, Job Search research-only mode,
permissions, subscriptions, canonical Professional state or Production.
