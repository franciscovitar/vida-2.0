# Professional Intelligence — Gate B2.1 (V16 usability refinement)

2026-10-10. Scope: `/professional/mercado` in the authenticated `vida-qa` preview, not Production.

## Problem observed in owner screenshots

1. Expanded labor/resilience indicators remained in English.
2. Individual horizon switches required the user to memorize earlier numerical ranges.
3. Uncalibrated AI-alone scenario ranges looked like empirical unemployment risk despite textual warnings.

## Changes

- A Spanish presentation layer for the **eleven** canonical resilience profiles, covering **159** individual list items: human work, protection actions, risk-up and risk-down indicators. PAS and its authorized Vida derivative remain unchanged. The English original is available in a secondary disclosure for audit.
- Every translation is tied to PAS source commit `aa5d930c43c39401a5cfed1a30556e8c72780f4f` and an original-text fingerprint per role (deterministic change detector, not a security hash). If original list content/order or commit changes, Spanish translation falls back to an explicit pending-review state and cannot silently misalign.
- A three-panel historical **scenario trajectory**, each presenting all Y1, Y5, Y10, Y20 bands simultaneously. Ranges show both numeric endpoints on the shared 0–100 scale; the bands are _not_ connected/interpolated to invented years. Clicking a horizon row updates the top detail. Y20 remains an explicitly labeled stress test.
- A prominent visual warning above the controls distinguishes (a) uncalibrated _scenario capacity_ percentage from (b) AI-native resilience heuristic index and (c) workforce compression heuristic index. None are empirical job-loss probabilities, nor unemployment percentages.

## Non-goals and evidence boundaries

- No new scores, predicted careers, forecasts, claim of validated confidence intervals, or conversion of percentages into individual employment risk.
- No change to 132 previously pinned PAS-derived ranges, data loader, global source, V17 time horizons, authenticating DAL, auth variables, calendar, World, scheduled tasks or billing.
- `vida-qa` is the owner's authenticated Preview URL `https://vida-2-0-git-vida-qa-genova.vercel.app/professional/mercado`.
- PAS canonical intelligence stays in `AI/projects/professional-intelligence/AI_CAREER_RESILIENCE_CURRENT_V1.json`. GitHub/Vida stores only UI presentation and authorized derivatives. New evidence needs curation in PAS before numbers change.

## Gates

- Four additional `PRO-B21` tests: translation coverage for 11 profiles, fingerprint and source-commit pin, 132 numeric band sanity checks, actual selected software trajectory.
- Apply exact Prettier 3.9.5 formatting and run full `npm test`, `npm run check`, `npm run build` in GitHub CI before updating `vida-qa`.
- After CI PASS, use a non-force fast-forward of the bounded PR head to `vida-qa`, never `main`, then confirm Vercel's authenticated alias is READY at exact SHA, and wait for owner's desktop/mobile visual review.
