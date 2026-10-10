# Professional Gate C2.1 — Observed job-posting skill mentions

**Date:** 2026-10-10. **Target:** authenticated `/professional/mercado` in `vida-qa` only, no Production change.

## Observed evidence

- Current PAS `main`: `08ae01c509111438cb77f0f9582b9966013ae4a2`.
- Canonical count source: `AI/projects/professional-profile-v1/MARKET_FIT_QA_CURRENT_V1.json`; supporting 20-posting names, requirements and URLs: `AI/projects/professional-profile-v1/MARKET_FIT_QA_2026-10-02.md`.
- 2026-10-02 purposive sample, `n=20`, **17 direct mention counts**, mixed Córdoba / Argentina / LATAM-remote, junior to senior, targeted software/full-stack/product roles.
- This is not a probabilistic or representative sample. All values are `mentions out of 20 selected postings`, **not a labor-market-wide vacancy percentage**. Skills may co-occur within the same posting; counts must not be added together.
- Direct 2026-10-10 read of authoritative existing Google Sheet `Job Search Market Evidence V1` (ID `1JzpLjmMO1TK15KlNSzgJbSoq3a5PT0BBsUa0kMCAX0k`): tabs `Observations`, `Weekly Summary`, `Source Yield` have headers only, **zero recorded observations**, zero weekly summaries and zero source-yield rows. Therefore no new observed frequency, per-geography estimate, trends or change rates are authorized.
- The canonical Job Search V1 system is already scheduled weekly in `RESEARCH_ONLY` through early November. This change neither duplicates, triggers nor modifies that schedule. Application/contact actions remain forbidden until the user's explicit approval after activation review, per `JOB_SEARCH_RUNTIME_V1.md`.

## UI increment

A new read-only `ProfessionalSkillDemand` block on `/professional/mercado`, inserted after existing occupational charts, before directional horizons. Horizontal bars show `n de 20` for 17 exact canonical counts. User can filter `Todas / Tecnologías / Capacidades`. Chart labels are separated into technology stack references and broader professional capability signals. It is **not** a top list or single score.

An upfront limitation names the sample selection method, mixed geography, varied seniority and denominator. A distinct evidence collection status explains why time trends and remote/geography comparisons remain unavailable. A direct link exposes the original 20 source URLs and methodology in PAS. Preview remains protected by `requireAuthorizedSession`, the existing DAL.

Source contract is fail-closed on source commit, n=20, method, geography, counts (0-20), 17 distinct IDs, time observation, missing/invalid input and unsupported fields (including invented market percentages or unverified trends). If observed data age exceeds 30 days, show a historical-evidence warning without erasing traceability.

## Quality and release

Seven `PRO-C2-01..07` tests cover exact canonical counts, provenance, no fake percentages/trends, no false weekly accumulation, role/geography/method constraints, staleness and stack/capability grouping. Run `npm test`, `npm run check`, `npm run build` on one coherent PR before any QA promotion. Do not use Vercel/GitHub as a repeated debugging loop. Promote only exact verified commit with `vida-qa` fast-forward. Confirm the owner's existing Preview alias points to that SHA and is READY. **Never update Production `main`** without subsequent explicit approval.

## Deliberately held

V06 representative vacancy frequency by skill/geography, V07 skill demand trends over comparable weeks, V08 vacancy sample geography comparison, V11 current tech demand across all software occupations. Requires deduplicated per-vacancy observations, eligibility, same sampling method and consistent time windows in the registered evidence store; a historic purposive sample cannot substitute for a current comparable probability sample. Do not write sample back into the job Sheet pretending weekly ingestion already happened. Do not auto-apply, email recruiters, edit public profile or spend money.
