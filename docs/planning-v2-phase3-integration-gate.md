# Planning V2 Phase 3 — isolated integration staging (2026-10-11)

Status: **DRAFT / OFFLINE ONLY / NO LIVE WRITER**.

This branch is a bounded **coherent copy** of the reviewed read-side modules and tests from Vida #237 (`fb86eceff0eebd9a265cd151b935cd2c3de67b1c`) and the dispatch/transport/write-intent/reconciliation modules and tests from Vida #239 (`b43171533bd8e577475dadd61b98a89568c8009f`), on the *current* protected `main` at `e2f6d2e561fda7d413e8b3442ef20a19fe712f1b`.

The only additional change is a branch-scoped `vercel.json` automatic deployment opt-out. No V2 source is changed relative to those exact PR blobs, and no new writer, endpoint, runtime signing key, UI call, or provider credential has been introduced. Other `main` content is retained. Source PRs remain open, and this is NOT a replacement for their review.

## Hard separation

- **Never deploy this branch, merge to protected `main`, connect to `vida-qa`, enable flags, run Redis EVAL/Google writes or create schemas based solely on this integration staging.**
- The staging branch contains modules only; **it is not an authenticated, certified writer**. Until a trusted issuer + sole authenticated dispatcher exist, synthetic integrity envelope and injected transport are insufficient to authorize a physical write.
- Preserve the unrelated 20-commit `vida-qa` divergence. No new branch is allowed to shadow the runtime target configuration of `vida-qa`.
- Preserve V1 and Production. The draft does not alter existing environment variables, provider permissions, Upstash ACL, backups, or Google Sheets.

## Required integration and acceptance gates

1. Observe **whole-tree integration CI** on this exact staging commit: TypeScript, lint/format, tests and Next.js build. Do not add previous #237 and #239 test counts as an integrated run. Correct only newly evidenced failures, preferably with local/repo-aware QA rather than repeated hosted build attempts.
2. Independently map the **actual authoritative DEV and Production workbooks** (not backup copies); confirm `vida-qa` runtime target equality to DEV and inequality to Production with **server-only boolean attestations**, no IDs/Secrets in results. Validate effective account, OAuth scope, 17/6-column schema and sheet IDs against live Google metadata. Missing execution tab is a separate owner-approved DEV-only schema operation.
3. Verify Upstash database intended for `vida-qa` from **authorized Upstash account metadata**, not a Vercel Secret or a suggested database name. Confirm namespace exclusivity, eviction OFF, token ACL constraints, destructive restore consequences and durability limitations. Existing Free DB has backups OFF and an unrestricted default user in the previous checkpoint; those facts do not grant authority.
4. Build and review the sole authenticated issuer/dispatcher binding canonical PAS row validation, actual user/QA authority, exact row hash, one durable non-expiring dispatch grant and single-send AppendCells. Reject all replay, delayed/ambiguous response and alternate writer routes. A Redis `DISPATCHED` decision is **not** confirmed Google persistence.
5. Diff-reviewed and **separately approved** one isolated Preview deployment with full Secret origin/source and branch scopes identified. Keep `git.deploymentEnabled` false through staging, prohibit Production variables, and run a private read-only Boolean attestation before any write.
6. Only after all positive gates, approve/perform the pre-defined **2099 synthetic two-row DEV canary** (one execution and one orientation, one exact replay check); verify physical readback and duplicates, quarantine ambiguous results without retry, and turn V2 gates OFF after completion. Personal activities remain deferred.

## Cost and rollback

- No additional infrastructure, Secret writes or deployment on branch creation. One GitHub hosted integration QA event may execute, so its actual status/cost must be verified separately. Do not run iterative Vercel builds as a debugger.
- If the staged code fails QA, leave PR in Draft and patch only that scoped delta; no provider rollback is necessary.
- If a separately approved DEV canary eventually executes, do not delete uncertain records or restore an earlier Redis ledger backup; disable V2 gates, retain immutable audit evidence and investigate before any further send.

Canonical operational gate: PAS #497, `AI/projects/tasks-daily-planning/PHASE3_WRITE_AUTHORITY_GATE.md`.
