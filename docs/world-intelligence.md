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

## Generalist knowledge maintenance — planned post-Phase-11 surface

PAS now defines a canonical bridge between the user's Generalist Competence **Knowledge** pillar and World Intelligence:

- `AI/projects/world-intelligence/GENERALIST_KNOWLEDGE_MAINTENANCE_CONTRACT_V1.md`
- `AI/projects/world-intelligence/GENERALIST_KNOWLEDGE_MAINTENANCE_V1.json`

Ownership stays strict:

- the Generalist inventory defines what knowledge matters, target breadth, benefits and maintenance class;
- World owns material change, evidence, provenance and bounded refresh candidates;
- Learning OS owns deliberate practice/mastery when explicitly activated;
- Vida only renders the sanitized derived maintenance view and routes.

Planned UX after the World Phase 11 final gate:

- `/world`: compact **Conocimiento vivo** section with only actionable deltas/refreshes;
- `/world/aprender`: optional **Mantener** lens;
- `/world/biblioteca`: complete **Mapa de mantenimiento** for all Knowledge-pillar areas.

No new primary navigation mode is required. No unread counts, streaks, catch-up debt or time-based forgetting claims are allowed. `UNKNOWN_BASELINE` must remain visibly unknown until supported by explicit state/evidence.

**Phase 11 guard:** this is a handoff contract only for now. Do not change the live World V1 prospective-evaluation UI or ranking until the final V1 gate closes.

