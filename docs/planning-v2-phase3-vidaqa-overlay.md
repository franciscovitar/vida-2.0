# Planning V2 Phase 3 — vida-qa isolated overlay

**Status:** Draft integration only. No deployment or active writer.

## Verified source baselines

- Actual QA branch: `vida-qa` at `03e096a5a957895bdaca12fdad1302804e98050c`.
- Tested integration: Vida #240 at `b19fefa66f03e7a199ad00cb685410f4be06afa1`.
- Independently checked: none of the 24 selected code/test paths changed
  in the existing `vida-qa` divergence relative to `main`.
- This branch carries exactly those 24 files from #240, without copying
  unrelated professional, academic, Calendar, OAuth or UI changes.
- The new branch-specific Vercel Git deployment rule is OFF. The existing
  `vida-qa` alias and deployment configuration are unchanged.

## 2026-10-13 DEV preflight improvement (unmerged, unexecuted QA)

On this draft branch, `google-append-once-v2.ts` now requires **two
read-only provider GETs**, immediately before the only possible POST:
workbook/tab identity, grid width and exact header values. On mismatch,
transport/auth failure or timeout it returns `not-sent` with zero POSTs.
All three V2 tab kinds are included; five negative/positive synthetic test
cases were added to the existing test file (24 total). **This change has
not run TypeScript tests or build on its new HEAD**, so do not treat it as
certified from source review alone. It does not solve trusted ChatGPT event
identity, user consent, single-writer authority, corrections or exactly-once
persistence.

Canonical DEV workbook as observed by the read-only Drive connector:
`1TBrEQuocPSNv9SradWea2YWQtMpOEIsHHNRJe0YACdY`. The Production
workbook is physically separate; no values were written. A read-only
Vercel project inspection identified `vida-2-0`; the env variable
metadata endpoint returned **403**, so **effective Preview variables
remain UNVERIFIED** (do not infer values or try reading decrypted secrets).


## Hard gates

1. The 24 modules and tests are a transport/readback staging set, not
   a credential-backed, session-authorized, single live writer.
2. Never merge into `vida-qa`, enable flags, publish a route, deploy
   a Preview or write Google/Redis based only on a green source QA.
3. Do not expose, inspect or downgrade stored Vercel Secrets.
4. Resolve authoritative Drive DEV/Production workbook references, then
   attest the effective runtime identity without exposing values.
5. Obtain an independent account-level Upstash mapping for V2. Earlier
   Vida Work documentation describes a shared OpenClaw Preview and
   Production physical Redis store with isolated namespaces. That
   historical fact does **not** authorize it for a nonexpiring V2
   dispatch ledger or establish safe backup/restore behavior.
6. **DEV schema metadata and three exact headers were read-only verified
   on 2026-10-13** in the DEV workbook; the Execution V2 17-column schema
   exists (sheetId 1324547998, 26 available columns). Daily Planning is
   sheetId 130076136 with six expected headers; Assessment Progress is
   sheetId 130076137 with eight. This validates **source shape**, not the
   effective Vercel env, service account, Google write scope or the writer.
   Verify those effective runtime bindings separately before any mutation.
7. Build the authenticated issuer and exclusive dispatch authority
   before any future V2 write. A simulated HMAC is not consent.
8. Require a reviewed Preview revision and owner-approved deployment
   plan with measured cost, isolation, stop conditions and rollback.
9. A later authorized synthetic 2099 canary must leave every V2
   write flag OFF, preserve immutable evidence and never replay an
   uncertain Google append automatically.

## Evidence and recovery

- GitHub QA for the parent #240 passed 2,127 tests and all verify/build
  steps. QA for this different `vida-qa`-based tree is separate.
- This overlay has no provider mutations, no credential/config changes
  and no runtime activation. Backout is to leave this Draft unmerged.
- Production, V1, current `vida-qa` and all source PRs remain untouched.

Canonical PAS gate: #497 `PHASE3_WRITE_AUTHORITY_GATE.md`.
