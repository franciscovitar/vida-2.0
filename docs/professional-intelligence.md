# Professional Intelligence surface

`/professional` is a read-only authenticated derivative of the canonical Professional + Technology Intelligence state in `franciscovitar/personal-ai-system`.

## Source-of-truth boundary

Canonical intelligence stays in PAS `main`.

Vida 2.0 stores only:

`data/generated/professional-snapshot.json`

This file is a **sanitized generated derivative**, not an editable source of truth.

It contains:

- current 1–2 now-moves;
- current top development/evidence priorities;
- bounded top-5 Professional Growth queue;
- task/facet-level Delegation Frontier (Vos sí o sí / Vos + IA / Delegable);
- explicit retirement from active learning when a facet becomes safely delegable;
- bounded strong-evidence summary;
- current market/forecast summary;
- bounded AI/technology state;
- learning/credential decisions;
- profile-positioning findings;
- AI Fluency calibration status;
- PAS commit/ref + observed/generated dates.

It deliberately excludes:

- CV file bytes;
- Drive URLs/IDs;
- email/contact data;
- private source corpora;
- API tokens/secrets;
- raw job-board records;
- raw papers/news;
- full evidence graph.

## Fail-closed behavior

`lib/professional/snapshot.ts` reads the generated file server-side.

`lib/professional/contract.ts` validates the DTO.

If the file is:

- missing;
- invalid JSON;
- outside the expected schema;

the UI renders an unavailable state. It does not fall back to mocks or fabricated recommendations.

If the snapshot is older than its declared `staleAfterDays`, the UI still shows the last bounded state but displays an explicit stale warning. A stale snapshot must be refreshed before a sensitive decision.

## Refresh contract

The snapshot is replace-in-place.

Do not create dated snapshot files.

When PAS current state materially changes and the canonical PAS change has been merged:

1. regenerate the sanitized derivative from PAS `main`;
2. replace `data/generated/professional-snapshot.json`;
3. update `source.commit`, `generatedAt` and `observedAt`;
4. run Professional QA + repository tests/check/build;
5. review the diff;
6. merge through the normal protected-branch workflow.

The monthly Professional Intelligence refresh should include this derivative refresh whenever a current-state field shown by Vida 2.0 changed.

A weekly signal that only opens a PAS PR should **not** pre-publish unmerged intelligence into Vida 2.0.

## UI contract

The screen separates:

- recommendations;
- Crecimiento / Huecos a llenar;
- current task/facet ownership and last frontier review;
- demonstrated evidence;
- uncertainty/gaps;
- market/forecast context;
- technology proposals;
- learning decisions;
- positioning findings;
- AI Fluency evidence.

It must not show:

- universal role winner;
- universal skill score;
- universal employability/mastery/automation percentage;
- universal “best AI”;
- AI replacement probability;
- job-board sample as market census;
- stale salary as current salary;
- technology candidate as already adopted.

Technology adoption remains owned by PAS `system-maintenance`.

## Verification

Dedicated tests live in:

`tests/professional-intelligence.test.ts`

They cover:

- valid snapshot contract;
- missing snapshot fail-closed;
- invalid snapshot fail-closed;
- stale detection;
- system-maintenance ownership;
- valid no-course/no-credential decision;
- top-5 growth queue bound;
- valid ownership lanes;
- delegated/retired facets excluded from active learning;
- frontier review metadata preserved;
- no universal ranking/winner UI;
- protected dynamic route and navigation.

Final implementation verification still requires observing:

```bash
npm test
npm run check
npm run build
```

or the current canonical aggregate:

```bash
npm run verify
```

## Professional Growth + Delegation Frontier

The generated snapshot now uses schema V3 and carries the sanitized current Professional Growth state from PAS `main`.

The unit of delegation is a **task/facet**, not an entire technology. A broad skill may therefore contain work in different lanes at the same time.

Vida 2.0 does not decide ownership. PAS owns reassignment using current market/frontier evidence plus personal AI Tool Eval / AI Fluency outcomes.

When a facet becomes safely delegable:

1. it is marked `AI_DELEGATED` / `RETIRED_FROM_ACTIVE_LEARNING` in canonical PAS state;
2. it stops consuming an active study slot;
3. the bounded top-5 queue can pull in the next unresolved gap;
4. retirement is never displayed as personal mastery.

If later evidence shows repeated rework, unsafe output, stronger market demand for direct depth or loss of supervisory judgment, the facet can return to `HUMAN_PLUS_AI` or `HUMAN_CORE`.

Adaptive practice remains owned by Learning OS. The snapshot only carries the current target, facets and routing state.
