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

## Canonical source

Generated derivatives are pinned to PAS `main` commit:

`4ef65a46b3da9bcd2af11fc64091114ec53b29be`

Any future refresh must preserve the same read-only boundary and exact published-piece provenance.
