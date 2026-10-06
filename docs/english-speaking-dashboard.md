# English Speaking dashboard

## Purpose

`/aprendizaje/ingles` is the read-only Vida 2.0 presentation layer for the canonical English Speaking Lab state.

Canonical intelligence and durable learner/deck state live in the private `franciscovitar/personal-ai-system` repository under:

`AI/projects/english-speaking-lab/`

Vida does not infer or write English proficiency.

## Source contract

The dashboard supports two read-only source modes.

### Versioned projection snapshot

Default/fallback source:

`lib/english-learning/profile.snapshot.json`

This is a sanitized projection derived from the canonical English Speaking Lab state. It is committed to the private Vida repository and deployed with the app, so Production can show real evidence without exposing a GitHub token.

The canonical projection is maintained in Personal AI System at:

`AI/projects/english-speaking-lab/state/vida_projection.json`

The Vida snapshot is a derived mirror, never the source of truth.

### Direct GitHub read

Optional remote mode:

```bash
ENGLISH_PROFILE_DATA_SOURCE=github
ENGLISH_PROFILE_GITHUB_TOKEN=

# Optional overrides
ENGLISH_PROFILE_GITHUB_REPOSITORY=franciscovitar/personal-ai-system
ENGLISH_PROFILE_GITHUB_REF=main
ENGLISH_PROFILE_GITHUB_PATH=AI/projects/english-speaking-lab/state/learner_profile.json
```

Use only a least-privilege read-only credential. Never expose it through `NEXT_PUBLIC_*` or commit a real token.

If direct GitHub reading is unavailable or unconfigured, Vida falls back to the latest versioned projection.

The legacy value `ENGLISH_PROFILE_DATA_SOURCE=disabled` is treated as snapshot mode for backward compatibility.

## Runtime states

- `ready` — a valid canonical/direct or versioned projection is loaded;
- `unconfigured` — remote GitHub mode was requested but has no token;
- `unavailable` — remote GitHub could not be read;
- `invalid` — source value/profile contract is invalid.

Remote failures do not force an empty dashboard when a valid versioned projection exists.

## Evidence rules

The UI deliberately separates:

- **proficiency evidence** — CEFR working range, skill states, strengths and targets;
- **practice/engagement** — activity and momentum;
- **adaptive Anki state** — active/high-priority/retired targets and current reinforcement targets.

Anki success is supporting evidence, not mastery. Fresh spontaneous transfer remains stronger evidence.

Practice activity must never promote CEFR or skill states by itself.

The skill map renders qualitative evidence states:

`insufficient_evidence -> emerging -> developing -> stable -> strong`

The segmented visual represents those states; it is not a hidden percentage score.

## Baseline behavior

Until sufficient Voice evidence exists:

- no CEFR level is shown;
- skills remain explicitly insufficient-evidence where appropriate;
- low-confidence candidate strengths/weaknesses may be shown with their real evidence state;
- the dashboard can still show current priorities, coverage and adaptive Anki targets.

## Synchronization contract

At substantial session closeout:

1. English Speaking Lab updates canonical `learner_profile.json` and `anki_master.json` when justified.
2. It regenerates `state/vida_projection.json`.
3. The same sanitized projection is mirrored to Vida's `profile.snapshot.json`.
4. Vida's normal Git/Vercel deployment publishes the new read-only view.
5. Read-back/validation is required before claiming persistence or deployment success.

If the Vida mirror cannot be written, canonical Personal AI System state remains authoritative and the projection update is reported as pending.

## Privacy and security

- Both repositories are private.
- No raw Voice transcript is mirrored into Vida.
- Only distilled learner/deck evidence appears in the projection.
- Vida never writes proficiency conclusions back to English Speaking Lab.
- Local Anki synchronization is a separate integration and must not be implied by this dashboard.

## Direct-GitHub activation checklist (optional)

1. Create a least-privilege read-only GitHub credential outside the repository.
2. Configure it as a server-only Vercel secret.
3. Set `ENGLISH_PROFILE_DATA_SOURCE=github`.
4. Verify the route reads canonical state and no secret appears in client output/logs.

Direct GitHub mode is an optimization; the versioned projection keeps the dashboard functional without it.
