# Finance OS Phase 5 — deterministic planning core

Status: first Phase 5 implementation checkpoint; pure calculation only.

## Purpose

Turn explicit, non-overlapping planning inputs into deterministic Safe-to-Spend, purchase-scenario
and basic resilience outputs before wiring personal plan data from the Finance Sheet.

This checkpoint intentionally does **not** write financial data, choose reserve policy, invent an
obligation horizon, infer goals from transaction history or combine currencies.

## Inputs

The planning core accepts one native currency at a time:

- eligible liquidity supplied by the caller;
- explicit commitments classified as reserve, upcoming obligation, committed goal funding or other;
- optional essential monthly burn for coverage metrics.

Every commitment has a stable ID, amount, currency and explicit overlap declaration. Reusing a
non-empty `overlapGroup` is rejected instead of silently double-reserving the same capacity.

## Safe-to-Spend

The core reuses the existing `safe-to-spend-v1.0.0` contract:

```text
eligible liquidity
- protected reserve
- upcoming obligations
- committed goal funding
- other non-overlapping commitments
= raw Safe-to-Spend
```

Displayed Safe-to-Spend remains `max(0, raw)`. A negative raw value remains an explicit shortfall.
The metric describes capacity; it is not a recommendation to spend.

## Purchase scenarios

A purchase scenario is deterministic and descriptive. It reports:

- Safe-to-Spend before the purchase;
- post-purchase eligible liquidity;
- post-purchase raw/display Safe-to-Spend;
- resulting shortfall;
- amount beyond Safe-to-Spend capacity;
- amount beyond eligible liquidity;
- a descriptive capacity state (`within-safe-capacity`, `uses-protected-capacity`, or
  `exceeds-liquidity`).

The engine does not emit buy/don't-buy advice.

## Resilience

When an explicit essential monthly burn is available, the core reports:

- reserve coverage months;
- eligible-liquidity coverage months.

When the burn is absent or zero, coverage remains `null` rather than fabricating a metric.

## Deferred to the next Phase 5 checkpoint

- derive eligible liquidity from real Finance OS evidence with explicit freshness/data-quality rules;
- map Obligations / Goals / Commitments store rows into planning commitments;
- settle the durable reserve-policy representation without breaking the current Sheet schema;
- define the upcoming-obligation horizon explicitly rather than hardcoding an arbitrary window;
- expose the read-only planning snapshot in `/finanzas`;
- persist snapshots only after a separately authorized write path exists.
