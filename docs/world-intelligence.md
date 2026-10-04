# World Intelligence in Vida 2.0

`/world` is Vida 2.0's authenticated presentation of canonical World + General Knowledge Intelligence. Published editorial content is read-only; explicit feedback is the only operational write path.

PAS owns evidence, NOW/LEARN selection, human-approved editorial drafts, published pieces and the published surface manifest. Vida stores sanitized generated derivatives only.

## Routes

- `/world`
- `/world/ahora`
- `/world/aprender`
- `/world/tema/[domain]`
- `/world/pieza/[slug]`
- `/world/biblioteca`

All routes use the same generated surface object.

## Failure behavior

World fails closed when the surface or a piece is missing, invalid or provenance-inconsistent. Vida never reconstructs a missing piece from a card or raw evidence.

## Feedback

Phase 10 is live. World exposes exactly the six canonical explicit-feedback values and persists one current value per published `brief_id` in the isolated World PostgreSQL store.

The server resolves metadata from the published piece; the client does not supply concept/domain routing metadata. Before a feedback write for a newly published piece, Vida idempotently registers only the metadata-minimal brief row required by the PostgreSQL FK, using `WORLD_DATABASE_URL` only. Existing brief identity conflicts fail closed. Editorial bodies and evidence are not copied into the feedback store.

If PostgreSQL is unavailable, the article remains readable and feedback degrades to unavailable/error state instead of breaking the piece.

## Canonical source

Generated derivatives are pinned to PAS `main` commit:

`4ef65a46b3da9bcd2af11fc64091114ec53b29be`

Any future refresh must preserve the same read-only editorial boundary, the narrow explicit-feedback write boundary, and exact published-piece provenance.
