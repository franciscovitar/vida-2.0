# Naranja X reconciliation — zero-write checkpoint

Status: implementation / no Reconciliation Sheet writes.

## Purpose

Reconciliation proves that imported account movements and statement balances tell the same story without hiding source defects.

For each native-currency statement section, Finance OS creates two kinds of checks:

1. **Closing check** — statement closing balance versus opening balance plus canonical movement delta.
2. **Opening-continuity check** — from the second statement onward, the current statement opening balance versus the prior statement's derived closing balance.

This separation matters because a month can reconcile internally while continuity with the next statement still fails.

## Status rules

### Closing

- reconciled: the statement is closed and printed closing balance equals the derived ledger close;
- conflict: the statement is closed but printed closing balance disagrees with the derived ledger close;
- partial: the current statement has no final printed closing balance; the latest source running balance is retained without pretending the month is closed.

### Opening continuity

- reconciled: current opening equals prior derived close;
- conflict: current opening differs from prior derived close.

difference_minor always means ledger_balance_minor minus source_balance_minor.

## Why two checks

This represents known source anomalies without overloading one number:

- a cross-month continuity gap is visible at the next statement opening;
- duplicated rows that corrupt a printed summary remain visible at the affected closing;
- a following month's opening may still confirm the deduplicated derived balance;
- a current partial month remains explicitly partial.

## Safety boundary

This checkpoint only builds deterministic Reconciliation rows.

It does not:

- classify income or expense;
- alter canonical Transactions/Postings;
- repair statement conflicts automatically;
- write Reconciliation rows to the operational store.

The next real-evidence dry-run must reproduce the already known 2026 Naranja X anomalies before any reconciliation write is considered.
