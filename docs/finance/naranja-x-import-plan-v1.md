# Naranja X import plan — V1 zero-write checkpoint

Status: implementation only; Finance writes remain disabled.

## Purpose

Convert a validated Naranja X parser result into a deterministic, bounded set of Finance Sheet append mutations **without executing them**.

The plan creates only:

- Accounts;
- Import Batches;
- Raw Transactions.

It deliberately does **not** create canonical Transactions/Postings or Reconciliations yet. Those require the normalization/ledger layer and must not be faked from raw-source balances.

## Stable identity

- one stable Finance account ID per Naranja X native currency;
- one deterministic import-batch ID per statement period, currency and source PDF SHA-256;
- one deterministic raw-transaction ID per native-currency account + Naranja source operation ID;
- one SHA-256 raw-row hash over a stable JSON payload.

## Preflight

Before any write, the existing Finance store must be read and checked:

- identical pre-existing account definitions are reused;
- account-definition drift blocks the import;
- an existing deterministic batch ID blocks re-import;
- an existing deterministic raw transaction ID blocks the import;
- malformed/duplicate existing row IDs block the import.

This makes first-write behavior explicit and idempotency failures visible.

## Safety boundary

- no function in this checkpoint calls `writeFinanceMutations`;
- no PDF/private statement fixture is stored in Git;
- `FINANCE_WRITES_ENABLED` stays false;
- canonical ledger/postings remain a later step;
- the first real write still requires explicit authorization after a full zero-write preflight report.
