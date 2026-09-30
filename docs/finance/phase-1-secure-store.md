# Finance OS Phase 1 — Secure Store Contract

Status: implementation-ready, provider provisioning pending explicit cost/organization approval.

## Provider fit

The Phase 1 target is a **dedicated Supabase project** for Finance OS, not a shared database from another project.

Why it fits:
- PostgreSQL gives explicit constraints, transactions and reproducible migrations;
- Supabase provides a managed Data API, RLS primitives, backups by plan and project isolation;
- Vida 2.0 can keep the credential server-only and avoid exposing finance data to browser code;
- the current user account already has Supabase available, but the existing projects belong to other domains and must not be reused.

The live project is intentionally **not provisioned by this PR**. Project creation can have a recurring cost and requires a specific organization choice, so that remains a separate approval gate.

## Trust boundary

Finance data is CONFIDENTIAL.

Browser:
- no Supabase secret;
- no direct Finance Data API calls;
- no raw statements in client logs or analytics.

Vida server:
- verifies the existing Auth.js owner allowlist;
- resolves Finance configuration server-side;
- scopes every request to FINANCE_OWNER_KEY;
- uses a dedicated Supabase service credential;
- blocks mutations unless FINANCE_WRITES_ENABLED is exactly true;
- never returns remote error bodies through the generic adapter.

Supabase:
- dedicated project isolates blast radius;
- all Finance tables have RLS enabled + forced;
- anon/authenticated grants are revoked;
- no public RLS policies exist in the initial migration;
- the dedicated service role is the only initial data path.

## Why service-role server access is acceptable here

Vida uses its own Google/Auth.js identity rather than Supabase Auth. Introducing a second user-auth system only to satisfy RLS would add complexity without improving the single-user threat model.

The V1 compromise is:
1. dedicated Supabase project;
2. no browser Data API access;
3. app-owner session check before every Finance request;
4. server-only service role;
5. explicit owner_key filter/injection;
6. independent write kill switch;
7. no delete method in the generic adapter.

If Finance later becomes multi-user, shared, or externally integrated, migrate to end-user JWT/RLS or a narrower database role before expanding access.

## Storage boundaries

GitHub:
- schema/migrations;
- types/contracts;
- generic adapters/tests;
- zero statements, balances, account IDs or private counterparty mappings.

Supabase:
- normalized operational state;
- private rules/mappings;
- parsed row-level raw payload needed for idempotency/audit;
- reconciliation state.

Drive/authoritative evidence:
- original PDF/CSV/XLSX statements and heavy evidence when retained.

## Environment variables

Required only after provisioning:
- FINANCE_STORE_MODE=supabase-rest
- FINANCE_SUPABASE_URL
- FINANCE_SUPABASE_SERVICE_ROLE_KEY
- FINANCE_OWNER_KEY
- FINANCE_WRITES_ENABLED

Production starts with FINANCE_WRITES_ENABLED=false. Turning it on is a separate consequential database-write approval.

## Backup / export / delete gate

Before importing personal data:
1. verify the selected Supabase plan's backup/restore capability;
2. prove the initial migration on the dedicated project;
3. run Supabase security advisors and resolve material findings;
4. document a tested export procedure for all Finance tables;
5. document restore steps and one rollback path;
6. keep originals in the authoritative evidence store;
7. keep deletion manual and approval-gated.

No real financial import is allowed before this gate is green.

## Initial schema

The migration creates:
- finance_accounts;
- finance_import_batches;
- finance_transactions;
- finance_raw_transactions;
- finance_transaction_sources;
- finance_postings;
- finance_reconciliations;
- finance_rules.

The schema preserves native currency and integer minor units. It does not yet claim strict multi-currency double-entry balancing; FX accounting validation belongs to the ingestion/ledger checkpoint where real examples are available.

## Failure behavior

Missing/invalid config:
- explicit disabled/not-configured result;
- no mock Finance data;
- no fallback to another Supabase project.

Remote error:
- return only bounded status/code to the caller;
- never echo private payloads or service credentials.

Write attempt while disabled:
- fail closed before the network request.
