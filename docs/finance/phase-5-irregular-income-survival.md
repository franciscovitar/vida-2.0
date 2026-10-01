# Finance OS Phase 5 — irregular-income survival mode

Status: read-only Phase 5 adaptation.

## Why this exists

A flat salary-style budget is a poor default when dependable income is materially below normal
spending and earned income arrives irregularly. Finance OS therefore separates observed history from
a user-chosen lean-month scenario instead of pretending future freelance income is guaranteed.

## Historical profile

The read-only profile uses only months inside the **common complete coverage window** of every loaded
source in the same native currency. A later month covered by only one source is excluded from the
profile rather than treated as a low-spend month.

For complete months it reports, separately:

- family-support income;
- work/freelance income;
- personal and professional economic spending;
- the bridge that would have been required without work income;
- share of months with negative economic cash flow.

Typical values are medians. The lower observed spending band is the 25th percentile. Neither value is
silently called a minimum budget.

## Survival scenario

The local scenario takes:

- user-chosen lean monthly burn;
- expected family support for the scenario;
- current verified eligible liquidity.

It returns:

- monthly bridge requirement = max(0, lean burn - expected support);
- no-new-income runway = eligible liquidity / lean burn;
- support-adjusted runway = eligible liquidity / monthly bridge when the bridge is positive.

Expected support is a scenario input only. It never becomes current liquidity and does not increase
Safe-to-Spend before the money exists.

## Irregular income handling

Future freelance/web sales are never counted before receipt. When an income spike actually arrives,
the intended policy is a waterfall rather than a flat savings percentage:

1. cover immediate obligations and the chosen lean-month need;
2. refill the protected stability buffer;
3. fund explicit non-overlapping goals/commitments;
4. only then treat residual capacity as discretionary.

The exact protected reserve and lean-month target remain user-owned choices and are not inferred from
transaction history.

## Privacy and persistence

The historical profile is derived server-side from the private Finance Sheet. Scenario inputs live
only in browser state. No values from this mode are written to the Finance Sheet by this checkpoint.
