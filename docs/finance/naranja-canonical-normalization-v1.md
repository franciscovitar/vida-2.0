# Naranja X canonical normalization — zero-write checkpoint

Status: implementation / no canonical Finance Sheet writes.

## Purpose

Turn verified raw Naranja X rows into a **balanced but economically unclassified** canonical ledger without guessing income/expense semantics.

For every raw row:

1. create one deterministic canonical Transaction;
2. link exactly one Transaction Source to the immutable raw row;
3. post the signed movement to the real Naranja X financial account;
4. post the exact opposite amount to a native-currency system clearing account;
5. mark both postings `unknown_review` until deterministic rules or human-reviewed mappings resolve the economic role.

## Why the clearing contra exists

The canonical ledger must balance before categorization.

A raw +10,000 ARS account movement becomes:

- Naranja X ARS: +10,000
- Unclassified ARS clearing: -10,000

The transaction sums to zero and preserves the observed account movement. It does **not** claim the receipt is income.

Later classification can replace/link the contra semantics for:

- earned income;
- family support;
- expense;
- reimbursement/receivable;
- internal transfer;
- liability settlement;
- business/family pass-through;
- refund/adjustment.

## Native-currency invariant

ARS and USD never balance against each other directly. Each transaction has one currency and its own unclassified clearing account.

## First normalization gate

The first real canonical dry-run must produce, from the verified 649 Naranja X raw rows:

- 2 system unclassified clearing Accounts;
- 649 Transactions;
- 649 Transaction Sources;
- 1,298 Postings;
- exactly two Postings per Transaction;
- every Transaction balance = 0 in native currency;
- every raw row linked exactly once;
- every economic role remains `unknown_review`.

No Finance Sheet write is authorized by this checkpoint.
