# Planning V2 Phase 3 — integration staging

**Status:** Draft. Offline only. No live writer.

## Sources

- Read-side code and tests: Vida #237 at `fb86eceff0eebd9a265cd151b935cd2c3de67b1c`.
- Dispatch and transport: Vida #239 at `b43171533bd8e577475dadd61b98a89568c8009f`.
- Protected baseline: `main` at `e2f6d2e561fda7d413e8b3442ef20a19fe712f1b`.
- The original PR branches remain unmerged and unmodified.
- Branch-specific `vercel.json` prevents an automatic staging deployment.

## Security review

- Redis dispatch and V2 readback must have an explicit DEV target.
- Vercel environment must be Preview or development, never Production.
- The effective data source must be Google.
- DEV and Production workbook identifiers must both exist and be distinct.
- Server-side config guards are necessary but not proof of live authority.

## Required before the first Preview

- Verify the current `vida-qa` branch without overwriting its unrelated work.
- Establish DEV and Production identities independently from Drive.
- Confirm the intended Upstash DEV database, ACL, backup and restore policy.
- Verify Google service-account identity, scope, tab IDs and headers.
- Review a trusted authenticated issuer and exactly one live writer.
- Obtain a separate review of the exact Preview diff, cost and rollback.
- Keep all write flags disabled until the live attestation passes.

## Synthetic canary

The 2099 canary remains pending. Never send it until the provider
identities, schema and authenticated dispatcher are certified. Never
retry an uncertain write automatically. Keep V2 write flags OFF after
any approved trial. V1 and Production remain untouched.

Canonical operational state: PAS #497, `PHASE3_WRITE_AUTHORITY_GATE.md`.
