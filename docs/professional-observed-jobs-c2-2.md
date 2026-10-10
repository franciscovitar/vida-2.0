# Professional Gate C2.2 — observed vacancies, skill mentions and entry barriers

**Target:** `vida-qa`, authenticated `/professional/mercado`. No Production merge or deploy in this increment.

## Authoritative evidence read on 2026-10-10

The registered Google Sheet **Job Search Market Evidence V1** (`1JzpLjmMO1TK15KlNSzgJbSoq3a5PT0BBsUa0kMCAX0k`) was read directly: 14 `Observations` from 2026-10-10, one corresponding `Weekly Summary` and one `Source Yield` row. All 14 `dedupe_key` values are distinct; **two** job URLs were already included in the *different purposive* PAS sample on 2026-10-02, leaving **12 distinct URLs not in that historical selection**. There are **not 34 independent fresh postings**.

This was a manually advanced, selectively sourced sample of mixed geography, job-board freshness and seniority, **not the 2026-10-12 scheduled Monday execution** and not reproducibly sampled week-over-week. The job-board URLs are traceability to visible listings; not every employer's ATS open/closed state was confirmed. Some postings are old. Never label all fourteen as newly opened current opportunities.

The source of truth remains Google Sheets; the new `data/generated/professional-observed-jobs-c2.json` is a **read-only derivative** generated from an observed and bounded Sheet snapshot (source ID and date included). No Sheets reads from the browser; no new evidence authority, cron, secrets, paid services or job submissions. Next research scan must dedupe against existing Sheet rows before appending. Future Sheet changes **do not automatically update this build-time derivative**; perform a reviewed refresh after new verified observations.

## User experience

Reuses the **existing** `ProfessionalSkillDemand` module instead of adding a second competing tech chart:

- Select "Registro 10 oct · 14 ofertas" (default when a valid derivative is available) or "Muestra histórica 2 oct · 20 ofertas". Both remain separate; **no trend arrow, comparison percentage or joined denominator**.
- Historical C2.1 preserves exactly its 17 authorized counts/filters and links to PAS evidence.
- Recent snapshot shows within-14 `must_have` keyword mentions under **documented broad groupings**, including React Native under React, and AWS/Docker/Kubernetes/CI-CD under Cloud/DevOps. These are **label normalization**, not employer-confirmed standardized skill IDs or a survey prevalence estimate.
- V05: mutually exclusive `0–2 years explicit`, `3+ years explicit`, `years unspecified`, with "Junior" titles **separate** from these categories.
- V08: four source-geography classes (Córdoba presencial/híbrido, Argentina remoto, LATAM remoto, unknown), strictly **sample composition**, not number of open positions by region.
- Expandable list of the 14 original job URLs, plus direct link to the registered Sheet and explicit freshness caveat.
- Replaces the stale "Sheet has no observations" message with the registered 14 and the two historical overlaps.
- `RESEARCH_ONLY` continues unchanged. No applications, employer contact, personal profile mutation, or job search activation.

## Fail-closed and verification

`lib/professional/observed-jobs-contract.ts` checks source ID, date, manual sampling method, individual job evidence URLs, identities, schema exactness, unknown years, distinct keys/URLs, declared overlap and no unsupported fabricated rate/trend field. `loadObservedJobs` enforces the existing authorized server loader boundary; snapshot invalid/missing -> historical fallback plus explicit warning. Snapshot older than 30 days -> visibly historical.

`tests/professional-observed-jobs-c2.test.ts` covers evidence denominator, 7 explicit skill term counts, 3 mutually exclusive experience categories, 4 geography buckets, overlap, untrusted extra fields, duplicates and staleness. Run `npm test`, `npm run check`, `npm run build` on the exact branch head before promoting it into `vida-qa`. If CI is unavailable, leave as PR; do not claim green QA or Preview verification without receipts.

**HOLD:** V07 skill-demand trends, geography-adjusted demand comparisons, vacancy market share, comprehensive V11 demand, salary extrapolation or hiring probability. The 2026-10-02 selected 20 and 2026-10-10 logged 14 are different sampling exercises, not two comparable weekly waves.
