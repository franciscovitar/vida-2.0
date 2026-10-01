# Finance OS Phase 5 — local planning draft

Status: read-only/non-persistent Phase 5 checkpoint.

## Why this exists

The canonical Finance Sheet does not yet contain an explicit protected reserve, recurring obligations
or committed goal funding. Finance OS must not infer those decisions from transaction history or
silently default a missing reserve to zero.

The local planning draft lets the user explore those choices against verified eligible liquidity
without creating canonical financial state.

## Local-only contract

The draft accepts, per native currency:

- an explicit protected reserve, including an intentionally chosen zero;
- upcoming obligations for the current 31-day planning horizon;
- committed goal funding;
- other non-overlapping commitments;
- optional essential monthly burn for coverage metrics.

The user must explicitly confirm that the entered buckets do not double-reserve the same money before
the draft is calculated.

All values stay in browser component state. They are not sent to an API, written to the Finance Sheet
or persisted as snapshots.

## Outputs

The draft reuses the canonical deterministic Phase 5 engine and shows:

- Safe-to-Spend;
- shortfall;
- reserve coverage months when essential burn exists;
- eligible-liquidity coverage months when essential burn exists;
- the same local purchase-scenario calculator used by a canonical ready plan.

The result is clearly labeled as a draft and is not treated as the saved financial plan.

## What still needs the user

Completing the canonical Phase 5 milestone still requires the user to choose the real reserve policy,
confirm recurring obligations and decide which goals/commitments should be protected. Those values
must later enter the operational store through a separately authorized financial write path.
