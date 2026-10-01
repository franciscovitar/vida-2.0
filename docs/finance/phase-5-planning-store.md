# Finance OS Phase 5 — real planning inputs

Status: second Phase 5 implementation checkpoint; read-only store adapter.

## Purpose

Connect the deterministic planning core to real Finance OS evidence without inventing a reserve,
obligation, goal or account balance.

This checkpoint reads the existing private Finance Sheet only. It does not write planning rows or
persist snapshots.

## Eligible liquidity V1

An account contributes to eligible liquidity only when all of these conditions hold:

- the account is active;
- ownership is `owned`;
- beneficial scope is `personal`;
- liquidity class is `immediate`;
- the latest reconciliation is `reconciled` or `partial`;
- source balance equals ledger balance with zero difference;
- the balance evidence is not older than 35 days;
- the balance is non-negative.

Mixed-use, non-personal, stale, conflicting, unreconciled and negative-balance accounts are excluded
rather than guessed into spendable capacity. Native currencies remain separate.

The 35-day freshness window is an explicit V1 operational policy for monthly statement-style source
coverage. It is visible in the read model and can be revised deliberately later.

## Obligations and planning horizon

Active obligations with a due date at or before the next 31 days become upcoming-obligation
commitments. Past-due active obligations remain protected instead of silently disappearing.

Active essential monthly obligations also contribute to the optional essential-monthly-burn input
used for resilience coverage. Goal target amounts are metadata and are **not** subtracted merely
because a goal exists.

The 31-day horizon is an explicit V1 near-term planning policy, not a hidden heuristic.

## Reserve and goal commitments

The existing `Commitments` tab is the durable V1 representation for protected allocations without a
Sheet schema migration:

- `type=reserve` represents the explicit protected reserve;
- `type=goal` reserves only the committed amount and must reference a row in `Goals`;
- `type=other` represents another explicit non-overlapping commitment.

A reserve commitment is required before Safe-to-Spend is considered ready. An intentional zero
reserve can therefore be represented explicitly as a zero-amount reserve commitment. Missing reserve
data does **not** default to zero.

Duplicate non-empty `overlap_group` values are rejected by the planning core so overlapping capacity
cannot be silently double-subtracted.

## Current Production store observation

At this checkpoint, the real `Obligations`, `Goals`, `Commitments` and `Snapshots` tabs contain
headers only. This change therefore exposes verified eligible-liquidity readiness but intentionally
does not show a Safe-to-Spend amount until explicit plan data exists.

No private balances or personal planning values are committed to Git.

## Next checkpoint

- capture/authorize explicit reserve, obligations and goal commitments;
- verify the resulting native-currency Safe-to-Spend against the read-only adapter;
- expose purchase scenarios once the plan inputs are ready;
- keep snapshot persistence disabled until a separately authorized financial write path exists.
