# World Intelligence in Vida 2.0

`/world` is Vida 2.0's authenticated read-only presentation of canonical World + General Knowledge Intelligence.

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

Phase 9 does not create a duplicate feedback store. The canonical labels are shown as the next Phase 10 capability, but no write is attempted until the World operational adapter exists.

## Merge refresh

Before protected merge, refresh generated derivatives from PAS `main` and point their source metadata to the final canonical merge commit.
