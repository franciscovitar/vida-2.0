# Rhythm Stability V1 — implementation contract

Status: **pure runtime prepared; not wired to Production data or UI**.

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

| Contributor | Weight | Required? |
|---|---:|---|
| Sleep midpoint consistency | 45% | yes |
| Wake-time consistency | 25% | yes |
| Sleep-duration consistency | 20% | yes |
| Activity-midpoint consistency | 10% | no |

Available weights are renormalized when activity is unavailable. The three sleep contributors must all be usable before a numeric score is emitted.

## Versioned minute-to-score utility

The same consistency utility is applied to median day-to-day shift in V1:

| Median shift | Utility |
|---:|---:|
| 0 min | 100 |
| 15 min | 98 |
| 30 min | 92 |
| 45 min | 84 |
| 60 min | 74 |
| 90 min | 55 |
| 120 min | 38 |
| 180 min | 18 |
| 240+ min | 5 |

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

The initial implementation lives as a side-effect-free calculator and synthetic tests only.

Do **not** yet:

- add the score to the Production HealthScoreboard;
- read the new HAE folders from the web app;
- write derived features back to canonical health storage;
- infer disease/stress/overtraining from irregularity;
- use HRV;
- deploy this branch to Production.

Integration waits until Health Sync V2.1 completes its prospective automatic-run gate and the detailed sleep/hourly source adapter has an explicit ingestion contract.

## Acceptance tests

The V1 calculator must prove:

1. stable nights yield a high consistency score;
2. fewer than five usable nights fail closed;
3. midnight wrap uses circular distance;
4. one isolated outlier does not dominate the median;
5. absent activity remains missing rather than zero;
6. stable hourly activity can contribute without dominating sleep;
7. large repeated schedule shifts lower the consistency index without clinical labeling;
8. timestamps lacking an explicit offset fail closed.

Calculation version: `rhythm-stability-v1.0.0`.
