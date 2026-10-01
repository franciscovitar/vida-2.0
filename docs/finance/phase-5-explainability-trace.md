# Finance OS Phase 5 — explainable Safe-to-Spend trace

Status: read-only Phase 5 acceptance checkpoint.

## Acceptance goal

Phase 5 requires every subtraction from eligible liquidity to be explainable. The planning contract
therefore keeps an explicit trace for each protected reserve, upcoming obligation, committed goal
funding amount or other commitment.

Each trace line contains the stable commitment ID, user-facing label, bucket and native-currency
amount. An intentionally selected zero reserve remains visible as an explicit line rather than being
treated as missing data.

## Reconciliation invariant

For every ready planning snapshot:

```text
eligible liquidity
- sum(explanation lines)
= raw Safe-to-Spend
```

The core rejects the snapshot if this invariant cannot be represented as a safe integer equality.

The UI renders the same trace for both the local non-persistent planning draft and any future
canonical plan loaded from the Finance Sheet. Purchase scenarios continue to use the resulting
deterministic Safe-to-Spend contract.

No planning values are persisted by this checkpoint.
