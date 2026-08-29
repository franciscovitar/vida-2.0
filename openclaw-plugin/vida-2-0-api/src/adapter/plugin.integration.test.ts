/**
 * Integration test for the real OpenClaw plugin lifecycle: reproduces the
 * exact local-TUI defect (a raw, unresolved SecretRef object reaching
 * `factory`/`execute` for an agent credential) and proves the fix resolves
 * it via OpenClaw's own public `resolveSecretRefValues`, with zero network
 * activity (a local synthetic `exec` SecretRef provider) and zero real
 * secrets.
 *
 * This file requires the `openclaw`/`typebox` peer dependencies and is
 * therefore NOT part of the root repo's `npm test` (that glob only covers
 * `tests/*.test.ts` at the repo root, and this plugin's peer dependencies
 * are never installed there by design -- see
 * docs/block-6-openclaw-plugin.md). Run it manually after installing this
 * package's dependencies:
 *
 *   cd openclaw-plugin/vida-2-0-api
 *   npm install
 *   npm run test:integration
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { Check } from 'typebox/value';
import type { OpenClawPluginToolContext } from 'openclaw/plugin-sdk/agent-runtime';

const NODE_EXECUTABLE = process.execPath;

/** Writes a throwaway, local-only `exec` SecretRef provider script (no network) and returns its path. */
function writeSyntheticExecProvider(dir: string): string {
  const scriptPath = path.join(dir, 'exec-secret-provider.cjs');
  writeFileSync(
    scriptPath,
    [
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { input += chunk; });",
      "process.stdin.on('end', () => {",
      '  let request;',
      '  try { request = JSON.parse(input); } catch { process.stdout.write(JSON.stringify({ protocolVersion: 1, values: {} })); return; }',
      '  const ids = Array.isArray(request.ids) ? request.ids : [];',
      '  const values = {};',
      '  for (const id of ids) { values[id] = `synthetic-fixture-value-for-${id}-not-real`; }',
      '  process.stdout.write(JSON.stringify({ protocolVersion: 1, values }));',
      '});',
    ].join('\n'),
    'utf8',
  );
  return scriptPath;
}

type CapturedToolFactory = { name: string; factory: (ctx: OpenClawPluginToolContext) => unknown };

function makeFakeApi(config: unknown, pluginConfig: unknown, captured: CapturedToolFactory[]) {
  return {
    config,
    pluginConfig,
    registerTool(toolOrFactory: unknown, opts: { name: string }) {
      if (typeof toolOrFactory === 'function') {
        captured.push({
          name: opts.name,
          factory: toolOrFactory as CapturedToolFactory['factory'],
        });
      }
    },
  };
}

test('local embedded runtime: a raw SecretRef for an agent credential is resolved to a string before HMAC, never reaches crypto as an object', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'vida-b6-secretref-it-'));
  try {
    const scriptPath = writeSyntheticExecProvider(tmp);

    // Sanity-check the synthetic provider speaks the exec protocol correctly.
    const probe = spawnSync(NODE_EXECUTABLE, [scriptPath], {
      input: JSON.stringify({
        protocolVersion: 1,
        provider: 'b6fixture',
        ids: ['steward-key-fixture'],
      }),
      encoding: 'utf8',
    });
    assert.equal(probe.status, 0);
    assert.match(probe.stdout, /synthetic-fixture-value-for-steward-key-fixture-not-real/);

    const fakeOpenClawConfig = {
      secrets: {
        providers: {
          b6fixture: {
            source: 'exec',
            command: NODE_EXECUTABLE,
            args: [scriptPath],
            allowInsecurePath: true,
          },
        },
      },
    };

    // Exactly the reported real-world shape: raw, unresolved SecretRef
    // objects for the agent credential and the Vercel bypass.
    const rawPluginConfig = {
      baseUrl: 'https://vida-preview.example.invalid',
      vercelProtectionBypass: { source: 'exec', provider: 'b6fixture', id: 'bypass-fixture' },
      agents: {
        steward: {
          keyId: { source: 'exec', provider: 'b6fixture', id: 'steward-key-fixture' },
          secret: { source: 'exec', provider: 'b6fixture', id: 'steward-secret-fixture' },
        },
      },
    };

    const mod = await import('./plugin.js');
    const entry = mod.default;

    const captured: CapturedToolFactory[] = [];
    const fakeApi = makeFakeApi(fakeOpenClawConfig, rawPluginConfig, captured);
    (entry as { register: (api: unknown) => void }).register(fakeApi);
    assert.equal(captured.length, 1, 'expected exactly one registered tool factory');

    const tool = captured[0]!.factory({ agentId: 'steward' } as OpenClawPluginToolContext) as {
      execute: (toolCallId: string, params: unknown) => Promise<{ details: unknown }>;
    };
    assert.ok(tool, 'expected steward to receive a tool even with a raw SecretRef config');

    let capturedRequest: { headers: Record<string, string>; body?: string } | null = null;
    const originalFetch = globalThis.fetch;
    // @ts-expect-error -- test-only override of the global fetch the adapter uses; no real network call is made.
    globalThis.fetch = async (
      _url: string,
      init: { headers: Record<string, string>; body?: string },
    ) => {
      capturedRequest = { headers: init.headers, body: init.body };
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ ok: true, requestId: 'fixture-request-id', data: {} }),
      };
    };

    try {
      const result = await tool.execute('tool-call-1', { operation: 'system.overview', input: {} });
      const signature = capturedRequest?.headers['X-Vida-Signature'];
      // Node's createHmac throws a TypeError if given a non-string/Buffer
      // key, so simply reaching here with a well-formed signature proves
      // the secret was a resolved string, never the raw SecretRef object.
      assert.match(signature ?? '', /^[0-9a-f]{64}$/);
      assert.equal(typeof capturedRequest?.headers['x-vercel-protection-bypass'], 'string');
      assert.equal(JSON.stringify(result).includes('fixture-value-for'), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('local embedded runtime: a missing agent credential fails closed before any network attempt', async () => {
  const mod = await import('./plugin.js');
  const entry = mod.default;

  const captured: CapturedToolFactory[] = [];
  const fakeApi = makeFakeApi(
    { secrets: { providers: {} } },
    { baseUrl: 'https://vida-preview.example.invalid', agents: {} },
    captured,
  );
  (entry as { register: (api: unknown) => void }).register(fakeApi);

  const tool = captured[0]!.factory({ agentId: 'steward' } as OpenClawPluginToolContext) as {
    execute: (toolCallId: string, params: unknown) => Promise<{ details: unknown }>;
  };

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  // @ts-expect-error -- test-only override; must never actually be invoked.
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('must not be called');
  };
  try {
    const result = await tool.execute('tool-call-2', { operation: 'system.overview', input: {} });
    assert.equal(fetchCalled, false);
    assert.equal((result.details as { code?: string }).code, 'missing-credential');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('digital-order still receives no operational tool through the real register(api) path', async () => {
  const mod = await import('./plugin.js');
  const entry = mod.default;

  const captured: CapturedToolFactory[] = [];
  const fakeApi = makeFakeApi(
    { secrets: { providers: {} } },
    { baseUrl: 'https://vida-preview.example.invalid', agents: {} },
    captured,
  );
  (entry as { register: (api: unknown) => void }).register(fakeApi);

  const tool = captured[0]!.factory({ agentId: 'digital-order' } as OpenClawPluginToolContext);
  assert.equal(tool === null || tool === undefined, true);
});

test('the tool parameter schema validates the canonical no-input read operations', async () => {
  const { VidaOperationParamsSchema } = await import('./plugin.js');
  for (const operation of [
    'system.overview',
    'areas.list',
    'gym.summary',
    'technical.status',
    'technical.logs',
  ]) {
    assert.equal(
      Check(VidaOperationParamsSchema, { operation, input: {} }),
      true,
      `expected the canonical ${operation} call to validate`,
    );
  }
});

test('the tool parameter schema requires a correctly-shaped input for operations that need one', async () => {
  const { VidaOperationParamsSchema } = await import('./plugin.js');

  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'areas.get', input: { slug: 'salud' } }),
    true,
  );
  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'areas.get', input: { areaKey: 'area.salud' } }),
    true,
  );
  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'areas.get', input: {} }),
    false,
    'areas.get must require an identifying slug or areaKey',
  );
  assert.equal(
    Check(VidaOperationParamsSchema, {
      operation: 'areas.get',
      input: { slug: 'not-a-real-area' },
    }),
    false,
  );

  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'documents.search', input: { query: 'salud' } }),
    true,
  );
  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'documents.search', input: {} }),
    false,
    'documents.search must require query',
  );

  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'document.get', input: { slug: 'some-doc' } }),
    true,
  );
  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'document.get', input: {} }),
    false,
    'document.get must require slug',
  );
});

test('the tool parameter schema rejects an unknown/invalid operation', async () => {
  const { VidaOperationParamsSchema } = await import('./plugin.js');
  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'admin.deleteEverything', input: {} }),
    false,
  );
  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'system.overview' }),
    false,
    'input is still required',
  );
});

test('the propose and health call schemas remain unchanged and closed', async () => {
  const { VidaOperationParamsSchema } = await import('./plugin.js');
  assert.equal(
    Check(VidaOperationParamsSchema, {
      operation: 'task.create.propose',
      idempotencyKey: 'idem-1',
      reason: 'test reason',
      expectedChange: 'creates one task',
      risk: 'low',
      reversible: true,
      targetKey: null,
      payload: { title: 'Test task' },
    }),
    true,
  );
  assert.equal(Check(VidaOperationParamsSchema, { operation: 'system.health' }), true);
  assert.equal(
    Check(VidaOperationParamsSchema, { operation: 'system.health', extra: 'field' }),
    false,
    'system.health must stay closed to exactly {operation}',
  );
});

test('the config schema still accepts real SecretRef objects for every secret-bearing field (SecretRef schema regression guard)', async () => {
  const { ConfigSchema } = await import('./plugin.js');
  const ref = { source: 'exec', provider: 'b6fixture', id: 'fixture-id' };
  assert.equal(
    Check(ConfigSchema, {
      baseUrl: 'https://vida.example.com',
      vercelProtectionBypass: ref,
      agents: { steward: { keyId: ref, secret: ref } },
    }),
    true,
  );
  assert.equal(
    Check(ConfigSchema, {
      baseUrl: 'https://vida.example.com',
      agents: { steward: { keyId: ref, secret: {} } },
    }),
    false,
    'a malformed SecretRef (missing required fields) must be rejected',
  );
  assert.equal(
    Check(ConfigSchema, {
      baseUrl: 'https://vida.example.com',
      agents: { steward: { keyId: ref, secret: { foo: 'bar' } } },
    }),
    false,
    'an arbitrary object must be rejected, not just any object',
  );
});
