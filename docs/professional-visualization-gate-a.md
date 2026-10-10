# Professional Visual Intelligence — Gate A (first Mercado charts)

**Scope:** bounded read-only charts for V02/V03 in `/professional/mercado`.
**Status:** branch implementation under review; not merged into Vida `main` or deployed to Production.

## Canonical provenance

- PAS source: `AI/projects/professional-intelligence/LABOR_MARKET_CURRENT_V1.json`
- PAS pinned commit: `08ae01c509111438cb77f0f9582b9966013ae4a2`
- BLS source registry: `LM-SRC-001`, U.S. Occupational Projections 2025–2035, consulted 2026-09-18.
- Vida sanitized derivative: `data/generated/professional-visualization.json`.
- Data is an immutable snapshot, not a live API or prediction calculated by the page. The server-only loader validates source identity, semantics, cohort, periods and per-metric provenance with the Gate 0 contract.

## Three different questions, never one ranking

1. **Growth percentage:** BLS percent change 2025–2035.
2. **Net jobs:** round((employment_2035_thousands − employment_2025_thousands) × 1000). Both reported employment figures were rounded to one decimal thousand; this calculated difference can differ by ~100 from another officially rounded change field.
3. **Annual openings:** BLS annual average × 1000, which **includes openings due to replacements**, not just net additions.

All three are specific to **U.S. occupations and 2025–2035**, not current Argentina or LATAM job postings, junior opportunities, AI replacement probabilities or personalized probabilities of employment.

The initial screen focuses on Software Developers (15-1252), Data Scientists (15-2051), and Information Security Analysts (15-1212). The other five canonical BLS occupations are available by expanding each chart. The order stays consistent across charts and is not a universal best-career ranking. Bars share a zero baseline within each metric and use the same full eight-occupation scale even when five rows are collapsed. Every number is visible alongside its bar, including without color or hover.

## Refresh boundary

The snapshot contains exact PAS commit and canonicalRefs, source URL and observation date. A future PAS Professional refresh should generate a new version by transforming new canonical observations, then validate the derivative and tests before publication. Never silently reuse the old source commit or replace BLS U.S. figures with Argentina data.

**Still HELD:** V04 current comparable compensation chart, full personal skill proof matrix V13, all direct job-board totals and model-performance graphs. Existing salary cards and role notes remain available unchanged.

## Quality gates

- Contract tests from Gate 0 stay applicable.
- New tests verify the 24 source-derived metrics, 8 occupations, official units and example arithmetic, plus unsupported metric rejection.
- Run `npm test`, `npm run check`, and `npm run build` before considering merge.
- Review mobile/desktop, keyboard access to the five-occupation expansion, auth boundary, provenance and source labels.
- No extra packages, new runner, new scheduler, billing changes or authentication changes.
- Merging `main` may start a Production deployment through Vercel; **not part of this Gate A implementation**.
