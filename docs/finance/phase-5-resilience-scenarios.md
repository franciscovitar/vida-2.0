# Finance OS Phase 5 — resilience + local purchase scenarios

Status: read-only Phase 5 checkpoint.

## Resilience indicators

Vida 2.0 can derive two explanatory indicators directly from the existing economic cash-flow report
without new writes:

- **earned-income share** = `income_work / all economic income` in one native currency;
- **monthly income volatility** = population standard deviation of observed monthly economic income
  divided by its average.

Volatility is shown only when at least three observed months exist and the average income is
positive. Missing history remains unavailable rather than being scored or imputed.

When the deterministic planning snapshot is ready, the same surface can also show reserve-coverage
months and eligible-liquidity coverage months from the explicit essential-monthly-burn input.

These are separate descriptive indicators. Finance OS does not collapse them into an opaque
financial-health score.

## Purchase scenarios

Once Safe-to-Spend is ready for a currency, `/finanzas` exposes a local purchase simulator.

The entered purchase amount:

- stays in browser component state;
- is not written to the Finance Sheet;
- is not sent to an API or persisted snapshot;
- produces only the deterministic capacity states already defined by the Phase 5 planning core.

The simulator reports post-purchase Safe-to-Spend, protected capacity consumed and any amount beyond
eligible liquidity. It does not issue a buy/don't-buy recommendation.

## Current limitation

The real Finance Sheet still has no explicit reserve, obligations, goals or commitments. Therefore
the current Production plan remains configuration-required and the purchase simulator stays hidden
until those user-owned inputs exist.
