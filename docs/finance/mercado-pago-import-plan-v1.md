# Mercado Pago wallet import plan — V1 zero-write checkpoint

Status: implementation only; operational-store writes are not authorized by this checkpoint.

## Purpose

Convert validated Mercado Pago monthly wallet statements into deterministic raw Finance OS rows without assigning personal-income or personal-expense meaning.

The plan creates only:

- one Mercado Pago ARS wallet Account;
- one Import Batch per statement;
- immutable Raw Transactions.

## Account semantics

The Mercado Pago wallet is marked:

- owned by the user;
- ARS;
- immediately liquid;
- beneficial_scope = mixed.

The mixed scope is intentional. This account contains personal, freelance, reimbursement, own-account-transfer and business pass-through activity.

## Stable identity

- Account: finance-account:mercado-pago:ars
- Batch: statement period + ARS + source PDF SHA-256 prefix
- Raw Transaction: Mercado Pago operation ID
- Raw hash: SHA-256 over stable source facts

## What this checkpoint does not do

It does not:

- classify receipts as income;
- classify debits as expense;
- clear business pass-through flows;
- merge exact Naranja X ↔ Mercado Pago own-account transfers;
- interpret Mercado Pago credit repayments as purchase spending;
- import Mastercard credit-card activity;
- write to the operational store.

Those are downstream canonicalization and cross-source matching concerns.

## First real-evidence acceptance gate

Before a raw write is considered:

- all 8 Jan-Aug statements must parse;
- exact baseline = 380 unique movements;
- monthly counts must be 38 / 42 / 56 / 61 / 52 / 41 / 44 / 46;
- every source operation ID, signed amount, running balance and normalized description must match the accepted audit;
- every statement summary and all month-to-month boundaries must reconcile exactly;
- 14 known Naranja X ↔ Mercado Pago exact own-account transfer candidates must remain identifiable by source operation ID;
- current operational-store preflight must show no Mercado Pago Account, Batches or Raw IDs already present.

Only then should the first Mercado Pago raw write be prepared for explicit user authorization.
