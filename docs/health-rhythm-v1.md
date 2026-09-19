# Rhythm Stability V1 — implementation contract

Status: **pure runtime + raw-source adapter merged; Preview-only read-only Drive transport prepared behind an explicit fail-closed gate; not wired to Production data or UI**.

## Purpose

`Rhythm Stability` is the only new 0–100 domain score planned for Health Intelligence V1.2. It answers a narrow question:

> How consistent were the user's sleep/activity timing patterns across recent consecutive days?

It is a **personal consistency index**, not a disease-risk, circadian-disorder, stress, overtraining or cardiovascular-risk score.

## Why this construct exists

Sleep health is multidimensional: regularity/rhythmicity and timing are distinct dimensions alongside duration, efficiency and other features. Current longitudinal wearable research also supports treating rest-activity timing/stability as useful descriptive digital phenotypes. Those population associations justify measuring the dimensions; they do **not** validate this exact product score or justify causal/clinical claims.

Current evidence references:

- American Heart Association, multidimensional sleep health statement (2025): https://professional.heart.org/en/science-news/multidimensional-sleep-health-definitions-and-implications-for-cardiometabolic-health
- Device-based prospective sleep-regularity study (2025): https://pubmed.ncbi.nlm.nih.gov/39603689/
- Longitudinal commercial-wearable rest/activity rhythm study (2026): https://www.nature.com/articles/s41467-026-76147-6

Evidence strength for the **construct** is `moderate`. The exact score mapping below is a versioned product rule, not a validated clinical instrument.

## Production prerequisite already closed

Health Sync V2.1 is already accepted in Production. The accepted evidence includes:

- 21/21 Production self-tests;
- one subsequent real automatic time-driven sync;
- `errors=[]`;
- `filesTrashed=0`;
- no duplicate logical dates in the post-run readback;
- no rollback of a newer accepted source winner;
- no observed evidence loss.

This closes the old prerequisite that blocked adapter work. It does **not** authorize wiring Rhythm Stability to Production or the UI.

## Inputs

The pure calculator accepts already-normalized observations and performs no Google/HAE I/O.

Sleep per local day:

- explicit `date` (`YYYY-MM-DD`);
- `sleepStart` with explicit UTC offset;
- `sleepEnd` with explicit UTC offset.

Optional activity per local day:

- local hour `0..23`;
- step count per hour;
- input must already have source reconciliation/deduplication applied.

Missing stays `null`. Timestamps without an explicit offset fail closed. The calculator never infers timing from a daily sleep total.

## Raw-source adapter boundary

The source adapter is a separate pure layer:

`HAE raw evidence → adapter → normalized daily/intraday features → pure Rhythm Stability calculator`

The adapter accepts already-parsed JSON payloads plus minimal file metadata. It performs no Drive, Google API, filesystem, environment-variable or database I/O.

Expected source files:

- `HealthSleep-YYYY-MM-DD.json` for detailed sleep;
- `HealthRhythm-YYYY-MM-DD.json` for hourly rhythm/cardio.

Observed HAE v2 structure is represented only as a contract here; private biometric payloads are not committed to the repository. Synthetic fixtures are used in tests.

Adapter rules:

- validate filename day identity before using evidence;
- accept payload `date` as either `YYYY-MM-DD` or an offset-aware timestamp;
- require filename/payload local-day agreement;
- require explicit offsets for sleep timing and hourly activity bins;
- normalize valid `sleep_analysis` to `RhythmSleepObservation`;
- normalize valid hourly `step_count` to `RhythmActivityObservation`;
- never fabricate zero-valued hours for absent samples;
- keep missing evidence unavailable rather than coercing it to zero;
- reject unsupported `step_count` units;
- do not silently sum ambiguous duplicate hourly step bins;
- preserve source strings only for provenance/source-regime visibility;
- do not choose or enforce a preferred provider;
- expose structural availability of hourly HR, resting HR and HRV without feeding them into the V1 score;
- preserve prior valid normalized evidence when a later source snapshot is incomplete;
- skip an older source revision when comparable modification metadata proves it is older;
- remain deterministic and side-effect free.

Reconciliation is monotonic at the feature boundary: a later incomplete snapshot may advance source-version knowledge while retaining an earlier valid normalized feature. Missing/invalid current evidence is still reported explicitly through availability/diagnostics so preservation cannot masquerade as a fresh measurement.

## Preview-only read-only source transport

The next bounded integration layer is a **server-only Google Drive reader** that feeds already-parsed HAE JSON into the merged pure adapter.

Boundary:

`Google Drive read-only source → parsed HAE payloads → pure adapter → normalized features → pure Rhythm Stability calculator`

Safety rules:

- disabled by default unless `HEALTH_RHYTHM_SOURCE=drive`;
- hard-disabled when `VERCEL_ENV=production`, even if Drive configuration is present;
- uses only `https://www.googleapis.com/auth/drive.readonly`;
- requires two explicit allowlisted folder IDs, one for sleep and one for hourly rhythm/cardio;
- lists only the exact expected daily filename inside the configured folder;
- uses only `GET` requests to Drive;
- rejects duplicate same-name files instead of choosing one silently;
- caps each JSON payload at 512 KiB;
- never returns or logs Drive file IDs, folder IDs, credentials or raw payloads to the client;
- missing files remain missing; a caller may preserve a previously accepted normalized day while marking the current read as preserved rather than fresh;
- no source preference, no HRV dependency and no canonical write path are introduced.

Configuration names only (values stay in Vercel/local secret boundaries):

- `HEALTH_RHYTHM_SOURCE`;
- `GOOGLE_HEALTH_SLEEP_FOLDER_ID`;
- `GOOGLE_HEALTH_RHYTHM_FOLDER_ID`;
- existing server-side `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY`.

The Drive folders must be granted only the minimum read access required by the service account. Folder IDs and private health payloads remain out of GitHub.

This transport is intentionally a **Preview/local integration candidate**. Enabling it for Production requires a separate explicit authorization and a code/config change because the current runtime blocks Production unconditionally.

### Sanitized Preview check

After the three Preview-only source variables and least-privilege Drive folder grants exist, an authenticated operator can exercise the real read path without exposing raw health data:

`/api/health/rhythm-preview-check?end=YYYY-MM-DD`

The endpoint:

- exists only in Vercel Preview and returns 404 outside Preview;
- requires the normal authorized Vida 2.0 session;
- reads a trailing seven-day window ending on the supplied local date;
- returns only sanitized coverage/readiness counts plus whether the Rhythm score is computable;
- never returns sleep timestamps, step counts, source strings, raw HAE payloads, Drive IDs or folder IDs;
- uses `Cache-Control: no-store`.

This endpoint is an operator verification surface, not a product UI.

## Features

For each valid sleep night:

- sleep midpoint;
- wake time;
- sleep duration.

For hourly activity when usable:

- activity midpoint = the local hour at which cumulative daily steps crosses 50%.

The score uses **median absolute day-to-day shifts across consecutive calendar days**. Circular clock-time distance is used for sleep/activity timing so `23:55 → 00:05` is a 10-minute shift, not ~24 hours.

Median shifts make the first version robust to an isolated unusual night. Missing calendar days are not bridged as if they were consecutive observations.

## Minimum evidence

A numeric score requires at least four consecutive sleep pairs, equivalent to at least five usable nights when there are no gaps.

Activity is optional and only contributes after at least three consecutive activity pairs. Missing activity does not become zero and does not block a sleep-based Rhythm Stability score.

Confidence is separate from the score and grows with:

- usable recent sleep coverage (target: 7 nights);
- longitudinal depth (target: 14 nights);
- optional hourly-activity coverage (target: 7 days).

If the score cannot be computed, confidence is capped below 50.

## Contributors and weights

| Contributor                   | Weight | Required? |
| ----------------------------- | -----: | --------- |
| Sleep midpoint consistency    |    45% | yes       |
| Wake-time consistency         |    25% | yes       |
| Sleep-duration consistency    |    20% | yes       |
| Activity-midpoint consistency |    10% | no        |

Available weights are renormalized when activity is unavailable. The three sleep contributors must all be usable before a numeric score is emitted.

## Versioned minute-to-score utility

The same consistency utility is applied to median day-to-day shift in V1:

| Median shift | Utility |
| -----------: | ------: |
|        0 min |     100 |
|       15 min |      98 |
|       30 min |      92 |
|       45 min |      84 |
|       60 min |      74 |
|       90 min |      55 |
|      120 min |      38 |
|      180 min |      18 |
|     240+ min |       5 |

Intermediate values are linearly interpolated.

These are **engineering/product bands for interpretability**, not medical thresholds. Any future recalibration requires a new calculation version and evidence rather than silently changing historical semantics.

## Score bands

- `>=85`: very stable;
- `70–84`: stable;
- `50–69`: variable;
- `<50`: irregular;
- no numeric result: insufficient.

Again, bands describe the observed personal schedule consistency only.

## Integration boundary

The calculator and raw-source adapter remain side-effect free. The optional source transport is isolated server-side and read-only; it is not part of the client or score logic.

Do **not** yet:

- add the score to the Production HealthScoreboard;
- expose HAE/Drive folders or raw payloads to client components;
- write derived features back to canonical health storage;
- infer disease/stress/overtraining from irregularity;
- use HRV as a score dependency;
- change preferred-source rules;
- deploy this branch to Production.

The next integration decision comes only after this adapter contract and repository verification are accepted. UI and Production wiring remain separate consequential steps.

## Acceptance tests

The V1 calculator proves:

1. stable nights yield a high consistency score;
2. fewer than five usable nights fail closed;
3. midnight wrap uses circular distance;
4. one isolated outlier does not dominate the median;
5. absent activity remains missing rather than zero;
6. stable hourly activity can contribute without dominating sleep;
7. large repeated schedule shifts lower the consistency index without clinical labeling;
8. timestamps lacking an explicit offset fail closed.

The source adapter additionally proves with synthetic fixtures:

1. valid detailed sleep normalizes correctly;
2. payload day strings and offset-aware timestamps preserve local-day identity;
3. filename/payload date mismatch fails closed;
4. sleep timing without an offset is unusable;
5. missing sleep remains missing;
6. valid step bins normalize without fabricating absent hours;
7. ambiguous duplicate hours are not silently summed;
8. invalid step units fail closed;
9. source strings remain provenance only;
10. absent HRV remains unavailable;
11. a newer incomplete snapshot preserves prior valid normalized evidence;
12. an older revision cannot replace a newer accepted feature when version metadata is comparable;
13. the adapter feeds the pure calculator across several synthetic days.

Calculation version: `rhythm-stability-v1.0.0`.
