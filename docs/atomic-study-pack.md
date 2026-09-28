# Atomic Study Pack adapter

Vida consumes canonical Atomic Study Packs from Personal AI System without duplicating course authority.

## Source path

For the active assessment Vida first tries:

`AI/projects/university/subjects/<subject-id>/learning/atomic_study/<assessment_id>_pack.json`

If that exact pack does not exist, Vida temporarily falls back to the legacy
`learning/study_engine_items_v1.json` seed while subjects migrate.

## Runtime mapping

Semantic authoring interactions map onto existing renderers:

- `recall_reveal` -> manual recall/reveal;
- `short_typed`, `bridge_microcase`, `next_step`, `microcalc` -> typed short answer;
- `cloze_context` -> cloze renderer;
- `mcq_discriminate`, `true_false_correct` -> MCQ renderer;
- `visual_probe` -> typed answer plus safe `prompt_content`.

Format distribution remains an authoring decision in PAS. Vida renders the pack; it does not invent quotas or rewrite learning meaning.

## Review-unit semantics

Scheduling is owned by `review_unit_id`, not the cue id. Multiple cue variants in one review unit share scheduler/history. A session shows one deterministic cue per review unit and rotates variants across date keys.

A first appearance in Vida is **not automatically fresh**. The pack supplies intended context freshness; repeated cue/review-unit exposure degrades fresh/transfer items to familiar. Delayed evidence requires an actual prior review interval.

## Evidence

Attempts preserve:

- review unit;
- concept/facet;
- variant family;
- Light/Bridge role;
- interaction;
- evidence ceiling;
- context freshness.

FreshEvidence maps an exact facet when ConceptInventory knows it; otherwise it falls back to the mapped parent concept while retaining the facet in structured notes.

## Safety

The parser fails closed on malformed packs, invalid MCQ/binary items, subject/assessment mismatch, unsupported prompt content and duplicate review/item IDs. Rich prompt content is still rendered through the existing safe-content allowlist.
