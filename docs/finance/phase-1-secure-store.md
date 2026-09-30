# Finance OS Phase 1 — Google Sheets Operational Store

Status: provisioned empty store; application configuration and real import remain gated.

## Provider decision

Finance OS V1 uses a **dedicated Google Sheet** as its operational store.

This is intentional, not a spreadsheet-based user interface. Vida 2.0 remains the professional web application and deterministic calculation layer. The Sheet is a private, structured persistence backend for a single-user V1.

Why it fits now:

- Vida 2.0 already has a hardened server-side Google service-account path;
- Finance V1 is single-user and low-volume;
- Sheets avoids consuming a limited Supabase project slot or adding recurring infrastructure cost;
- the domain model remains provider-independent so a later PostgreSQL/Supabase migration does not redesign Finance OS.

Supabase is deferred until scale, concurrency, relational-query complexity, or operational evidence justifies it.

## Live store

A dedicated private spreadsheet named **Finance OS — Operational Store** has been created.

It is shared only with:

- the user's Google account as owner;
- the existing Vida 2.0 Google service account as writer.

The spreadsheet ID is **not** committed to Git. It belongs only in server-side environment configuration.

The store is currently empty of personal transactions.

## Trust boundary

Finance data is CONFIDENTIAL.

Browser:

- never receives Google service-account credentials;
- never calls the Finance spreadsheet directly;
- never logs raw financial payloads.

Vida server:

- verifies the existing Auth.js owner allowlist before Finance reads/writes;
- reuses GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY server-side;
- targets only GOOGLE_FINANCE_SPREADSHEET_ID;
- blocks mutations unless FINANCE_WRITES_ENABLED is exactly true;
- exposes typed Finance mutations, not arbitrary raw Sheets requests.

Google Sheet:

- dedicated file, not shared with other Vida domains;
- no public/link sharing;
- schema headers are validated before reads;
- structural tab IDs are resolved dynamically by title, so copies/backups remain portable.

## Store schema

Current tabs:

- Meta;
- Accounts;
- Import Batches;
- Raw Transactions;
- Transactions;
- Transaction Sources;
- Postings;
- Reconciliations;
- Rules;
- Obligations;
- Goals;
- Commitments;
- Snapshots;
- Interventions;
- Wellbeing.

Money remains explicit currency + integer minor units wherever practical. Raw evidence stays separate from canonical transactions/postings.

## Environment variables

Finance reuses the existing Google service-account credentials:

- GOOGLE_SERVICE_ACCOUNT_EMAIL;
- GOOGLE_PRIVATE_KEY.

Finance-specific:

- FINANCE_STORE_MODE=google-sheets;
- GOOGLE_FINANCE_SPREADSHEET_ID;
- FINANCE_WRITES_ENABLED=false by default.

There is no mock fallback for Finance data.

## Backup / export / delete gate

Before importing personal transaction history:

1. configure the dedicated spreadsheet ID in the server environment;
2. verify the service account can read every required tab;
3. verify schema headers against finance-sheets-v1.0.0;
4. create and verify a pre-import Drive copy/export;
5. keep FINANCE_WRITES_ENABLED=false during read-only validation;
6. enable writes only for a bounded import run;
7. verify counts/hashes/reconciliation after the write;
8. keep deletion manual and explicit.

Original PDFs/CSV/XLSX statements remain authoritative evidence in Drive or another approved evidence store.

## Failure behavior

Missing/invalid config:

- explicit disabled/not-configured state;
- no fake balances;
- no fallback to another Sheet.

Schema mismatch:

- fail closed before a Finance write;
- do not silently create/reorder columns.

Remote error:

- return bounded error codes;
- do not surface response bodies containing private data.

## Migration path

The domain contracts do not treat Sheets as permanent architecture.

If V1 outgrows Sheets, preserve:

- Account / Transaction / Posting contracts;
- source hashes and stable IDs;
- reconciliation semantics;
- Safe-to-Spend / resilience logic;
- evidence references.

Then replace only the store adapter with PostgreSQL/Supabase or another approved backend.
