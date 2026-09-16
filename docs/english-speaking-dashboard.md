# English Speaking dashboard

## Purpose

`/aprendizaje/ingles` is the read-only Vida 2.0 presentation layer for the canonical English Speaking Lab learner profile.

Canonical intelligence and durable learner state live in the private `franciscovitar/personal-ai-system` repository under:

`AI/projects/english-speaking-lab/`

Vida does not infer or write English proficiency in V1.

## Source contract

The dashboard is disabled by default and fails closed.

Server-only environment variables:

```bash
ENGLISH_PROFILE_DATA_SOURCE=disabled
# allowed active value: github

# Required when source=github. Use a least-privilege read-only credential.
ENGLISH_PROFILE_GITHUB_TOKEN=

# Optional overrides. Defaults point to the canonical Personal AI System profile.
ENGLISH_PROFILE_GITHUB_REPOSITORY=franciscovitar/personal-ai-system
ENGLISH_PROFILE_GITHUB_REF=main
ENGLISH_PROFILE_GITHUB_PATH=AI/projects/english-speaking-lab/state/learner_profile.json
```

Do not expose these variables through `NEXT_PUBLIC_*` and never commit a real token.

The recommended credential is restricted to read-only repository contents for the private Personal AI System repository.

## Runtime states

- `unconfigured` — integration disabled or token missing;
- `unavailable` — GitHub could not be read;
- `invalid` — source value/profile contract is invalid;
- `ready` — canonical learner profile loaded.

There is no silent production mock fallback.

## Evidence rules

The UI deliberately separates:

- **proficiency evidence** — CEFR working range, skill states, strengths, targets;
- **practice/engagement** — activity, momentum and optional practice XP.

Practice XP or session counts must never promote CEFR or skill states.

The skill map renders qualitative evidence states:

`insufficient_evidence -> emerging -> developing -> stable -> strong`

The segmented visual is a representation of those states, not a hidden percentage score.

## Baseline behavior

The canonical initial profile is intentionally empty. Until real Voice evidence is curated:

- no CEFR level is shown;
- skills show insufficient evidence;
- quests/achievements/vocabulary remain empty;
- the dashboard explains that the naturalistic baseline is being built.

## Activation checklist

1. Merge the English Speaking Lab project in `personal-ai-system`.
2. Complete enough Voice sessions to curate a real learner profile.
3. Create a least-privilege read-only GitHub credential outside the repository.
4. Configure the server-only environment variables in the intended Vercel environment.
5. Set `ENGLISH_PROFILE_DATA_SOURCE=github`.
6. Verify `/aprendizaje/ingles` shows the canonical profile and no secret appears in client output/logs.

Activation of a production secret/deployment is a separate consequential action and is not implied by merging this code.
