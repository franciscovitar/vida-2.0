# Professional Intelligence V2

`/professional` is a read-only authenticated derivative of the canonical Professional Intelligence state in `franciscovitar/personal-ai-system`.

## Product surfaces

- `/professional` — Panorama: current professional brief, material changes and 1–3 current moves.
- `/professional/mercado` — roles, demand/growth, compensation, seniority/entry context, remote samples, skill signals and AI transformation.
- `/professional/herramientas` — task-specific offer comparisons with filters, price, main limit and provenance.
- `/professional/crecimiento` — demonstrated evidence, bounded growth queue, Learning OS handoffs and Delegation Frontier.
- `/professional/biblioteca` — legacy Intelligence articles, deep explanations and the Technology Library without reading debt.

Legacy `/inteligencia` redirects to Professional. Historical article URLs remain readable for compatibility.

## Source-of-truth boundary

Canonical intelligence stays in PAS `main`.

Vida stores only sanitized generated derivatives:

- `data/generated/professional-snapshot.json`
- `data/generated/professional-market-detail.json`
- `data/generated/professional-offer-variants.json`
- `data/generated/ai-career-resilience.json`
- `data/generated/technology-library.json`
- `data/generated/intelligence-editorial-snapshot.json` plus sanitized article derivatives

These files are views, not editable sources of truth. They must preserve PAS repository/ref/commit and observation dates.

## Panorama contract

The visible current brief stays finite:

- normally 3–7 material changes;
- 1–3 current moves;
- each visible material change explains what changed or was confirmed, why it matters, what it means for the user and an explicit decision disposition;
- allowed decision language is `ACT / TRY / LEARN / WATCH / IGNORE / NO_CHANGE`.

The home must remain useful without opening any detail surface.

## Market contract

Market keeps separate evidence layers for:

- current target roles / best-fit context;
- demand and growth;
- compensation;
- remote/geography;
- seniority and entry context;
- skills with market signal;
- AI transformation/resilience.

It must not publish a universal role score, hiring probability, employability score or remote-fit score. Job-board samples are representative samples, not market-size estimates.

## Tools contract

Product, plan and access channel remain distinct candidates.

The UI exposes:

- a task/category selector backed by canonical comparison groups;
- comparison/ranking status;
- filters;
- price + main limit before expansion;
- limit exactness/provenance and verification date;
- official sources in detail.

If the offer snapshot is missing, invalid or stale, the comparison fails closed. Stale price/quota data is not shown as a live comparison.

A numeric/ordered ranking is shown only when the canonical group explicitly supports ranking. `COMPARISON_ONLY` must never be turned into a winner.

## Growth contract

Growth remains read-only in Vida.

The PAS owns:

- ownership lane;
- active growth queue;
- verification blueprint;
- profile claim strength;
- Delegation Frontier changes.

Vida may copy an Adaptive Learning handoff but must not write mastery or ownership.

## Library contract

Library is voluntary reference memory:

- no unread count;
- no backlog;
- no streak;
- no catch-up requirement;
- storing a technology does not imply installing, paying for or learning it.

## Fail-closed and freshness

Each derivative validates its schema before rendering.

Missing/invalid data renders an unavailable state rather than mocks or fabricated recommendations.

Stale current-state data remains visibly marked where historical/contextual reading is still useful. Consequential current comparisons such as active offer price/quota matrices fail closed when stale.

## Refresh contract

Derivatives are replace-in-place after the relevant PAS `main` state changes materially.

- fast tool/price/quota slices: revalidate on their canonical cadence or event trigger;
- role/market current state: refresh with the Professional monthly rebuild or material event;
- growth/profile state: refresh after material personal evidence or verification outcomes;
- historical editorial/library content may remain readable after it is no longer current.

Do not create dated derivative histories in Vida.

## Verification

Dedicated coverage lives in:

- `tests/professional-intelligence.test.ts`
- `tests/professional-v2.test.ts`

Final implementation verification requires the repository test suite, static checks, production build and one coherent Preview before protected merge.
