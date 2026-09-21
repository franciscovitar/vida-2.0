# Intelligence Editorial surface

`/inteligencia` is the low-friction reading layer for existing PAS intelligence.

It does **not** become a new research backend or source of truth.

## Ownership

- Career / skills / forecasts / technology candidates: Professional Intelligence.
- Current-event/evidence discipline: World Intelligence.
- PAS improvements/tool adoption: system-maintenance + Continuous Improvement Runtime.
- Personal workflow outcomes: AI Fluency.
- Vida 2.0: authenticated read-only presentation.

## Generated inputs

Vida combines:

- `data/generated/professional-snapshot.json`
- `data/generated/intelligence-editorial-snapshot.json`

The editorial snapshot is a sanitized derivative of:

`AI/editorial/INTELLIGENCE_EDITORIAL_CURRENT.json`

It intentionally does not duplicate Professional top lists.

## Product contract

The screen has four permanent fronts:

1. AI in ~2 minutes.
2. Career & Skills.
3. Tech & Open Source Radar.
4. Your PAS is improving.

A compact “Your radar now” is a view over those sources, not a separate ranking.

Deep dives are a format, not a fifth feed.

## Zero reading debt

The surface must not introduce:

- unread counters;
- missed-edition debt;
- streaks;
- infinite feed;
- mandatory feedback;
- engagement notifications.

If the user returns after several weeks, current state replaces old state. Historical Git state remains the audit trail.

## Progressive reading

Above the fold should answer in ~30 seconds:

- one big thing;
- why it matters;
- what to do.

A `details` section exposes the ~2 minute explanation and sources.

## Fail-closed

If either the editorial snapshot or Professional snapshot is missing/invalid, the page renders an unavailable state rather than inventing recommendations.

Stale data remains visible with a warning.

## Refresh

Editorial:

- weekly only when material;
- event-driven for major changes;
- `NO_MATERIAL_UPDATE` is valid.

Professional:

- existing monthly/quarterly/event-driven policy remains unchanged.

## Future additions

Only after prospective use supports them:

- one-tap feedback;
- bounded archive;
- audio;
- richer repository/security metadata;
- outcome handoff from “want to try”.

Do not add these merely because they are technically possible.
