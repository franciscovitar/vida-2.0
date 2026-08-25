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
- `openclaw.plugin.json` -- the native plugin manifest, hand-authored
  against the installed `openclaw@2026.7.1-2` plugin-manifest schema
  (`docs/plugins/manifest.md` in the OpenClaw package).

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
