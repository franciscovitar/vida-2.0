# vida-2-0-api (OpenClaw plugin)

Native OpenClaw tool plugin that bridges one isolated local Vida agent to the
private Vida 2.0 OpenClaw API (`/api/openclaw/v1`) over HMAC v2. See
[`docs/block-6-openclaw-plugin.md`](../../docs/block-6-openclaw-plugin.md) in
the main repo for the full architecture, certified B6 state and rollback notes.

This package is the canonical source for the plugin. The local OpenClaw
installation is operational runtime state, not a second source of truth. B6
was certified with this plugin installed locally, but any future local reuse
must revalidate the necessary runtime gates from `docs/WORK-CHECKPOINT.md`
instead of reconstructing setup from old transcripts.

## Layout

- `src/types.ts`, `src/operations.ts`, `src/agents.ts`, `src/canonical.ts`,
  `src/request-id.ts`, `src/secrets.ts`, `src/dispatcher.ts` -- the pure
  core. No dependency beyond Node built-ins. Unit-tested from the main repo
  at `tests/openclaw-plugin-*.test.ts` via `node --import tsx --test`.
- `src/adapter/plugin.ts` -- the OpenClaw SDK wiring (`defineToolPlugin`,
  `typebox`). This is the only file that imports `openclaw` or `typebox`.
- `src/adapter/plugin.integration.test.ts` -- focused harness against the real
  OpenClaw SDK/SecretRef runtime. Requires this package's peer/dev dependencies.
- `openclaw.plugin.json` -- the native plugin manifest. Its `description`,
  `activation`, `configSchema`, `contracts`, and `toolMetadata` fields are
  generated from `src/adapter/plugin.ts` by `openclaw plugins build
--entry ./dist/adapter/plugin.js` (confirmed against installed
  `openclaw@2026.7.1-2`; see `docs/plugins/manifest.md` in the OpenClaw
  package for the full schema). `configContracts` and `uiHints` are
  hand-authored manifest-only metadata that the generator does not touch.
  Re-run `openclaw plugins build` after changing the adapter's tool
  parameters, config schema, description, or activation, and commit the
  regenerated file verbatim rather than hand-editing it.

## Package checks

```bash
npm run build
npm run typecheck
npm run test:core
npm run test:integration
```

The root repo still owns the canonical pure-core regression suite through
`npm test`; `test:integration` is the package-local SDK/runtime proof.

## Building/installing for recovery or a fresh local runtime

Only do this when the local installation genuinely needs to be rebuilt or
reinstalled; B6 closeout does not require repeating these steps.

```bash
npm install
npm run build
openclaw plugins validate --entry ./dist/adapter/plugin.js
openclaw plugins install .
```

## Configuration reference

The secret-bearing fields accept OpenClaw SecretRefs. Never store real values
in this repo or paste them into handoffs. The following is a shape example
only; the certified local B6 setup used an indirect DPAPI CurrentUser-backed
provider rather than repository literals.

```json5
{
  plugins: {
    entries: {
      'vida-2-0-api': {
        config: {
          baseUrl: 'https://<vida-preview-or-prod-host>',
          // Optional. Only needed when baseUrl points to a protected Preview.
          // Vercel transport only; never replaces Vida HMAC.
          vercelProtectionBypass: {
            source: 'env',
            provider: 'default',
            id: 'VERCEL_AUTOMATION_BYPASS_SECRET',
          },
          agents: {
            steward: {
              keyId: { source: 'env', provider: 'default', id: 'OPENCLAW_STEWARD_API_KEY_ID' },
              secret: { source: 'env', provider: 'default', id: 'OPENCLAW_STEWARD_API_SECRET' },
            },
            // health-reflection and technical-guardian use their own pairs.
            // digital-order remains intentionally unconfigured/inert in B6.
          },
        },
      },
    },
  },
}
```

`digital-order` currently has no allowed reads or proposals; configuring a
credential for it would still not grant a capability because the tool factory
returns `null` for an agent with no Vida-data capability. The certified B6
posture leaves it without OAuth, without a Vida credential, without
`vida_operation`, and sandboxed.

The `agents` object itself is a required config key (it may be `{}`), even
though every named agent entry inside it is optional -- an unconfigured
agent simply gets `missing-credential` at dispatch time, not a config
validation error.

For the three active B6 agents, the certified local runtime pins
`openai/gpt-5.5` to `agentRuntime.id=openclaw` and exposes exactly
`vida_operation`. Preserve host-tool denies. Do not place `vida_operation`
in both `tools.allow` and `tools.deny`: OpenClaw's deny wins and removes the
tool.
