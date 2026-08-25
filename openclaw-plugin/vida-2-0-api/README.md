# vida-2-0-api (OpenClaw plugin)

Native OpenClaw tool plugin that bridges one isolated local Vida agent to the
private Vida 2.0 OpenClaw API (`/api/openclaw/v1`) over HMAC v2. See
[`docs/block-6-openclaw-plugin.md`](../../docs/block-6-openclaw-plugin.md) in
the main repo for the full architecture and rollback notes.

This package is the canonical source for the plugin. It is **not installed
or configured** against any local OpenClaw instance by this change; that is
an explicit later Work step.

## Layout

- `src/types.ts`, `src/operations.ts`, `src/agents.ts`, `src/canonical.ts`,
  `src/request-id.ts`, `src/secrets.ts`, `src/dispatcher.ts` -- the pure
  core. No dependency beyond Node built-ins. Unit-tested from the main repo
  at `tests/openclaw-plugin-*.test.ts` via `node --import tsx --test`.
- `src/adapter/plugin.ts` -- the OpenClaw SDK wiring (`defineToolPlugin`,
  `typebox`). This is the only file that imports `openclaw` or `typebox`.
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

## Building and installing (later Work step, not run by this change)

```bash
npm install
npm run build
openclaw plugins validate --entry ./dist/adapter/plugin.js
openclaw plugins install .
```

## Configuration (later Work step, not run by this change)

```json5
{
  plugins: {
    entries: {
      'vida-2-0-api': {
        config: {
          baseUrl: 'https://<vida-preview-or-prod-host>',
          // Optional. Only needed when baseUrl is a Vercel Preview with
          // Deployment Protection enabled -- see docs/block-6-openclaw-plugin.md.
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
            // ...health-reflection, digital-order, technical-guardian
          },
        },
      },
    },
  },
}
```

`digital-order` currently has no allowed reads or proposals; configuring a
credential for it does not grant it any capability -- the tool factory
returns `null` for any agent with no Vida-data capability.

The `agents` object itself is a required config key (it may be `{}`), even
though every named agent entry inside it is optional -- an unconfigured
agent simply gets `missing-credential` at dispatch time, not a config
validation error.
