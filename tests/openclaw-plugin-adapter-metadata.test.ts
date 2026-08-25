/**
 * Regression guards for the two OpenClaw 2026.7.1-2 runtime-validated
 * failures fixed in the adapter (import path, activation metadata drift).
 * These are lightweight, deterministic, and do not require the OpenClaw
 * SDK to be installed -- they inspect the adapter source text and the
 * manifest JSON directly rather than duplicating OpenClaw's own
 * `openclaw plugins validate` logic.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const PLUGIN_ROOT = path.join(__dirname, '..', 'openclaw-plugin', 'vida-2-0-api');
const ADAPTER_PATH = path.join(PLUGIN_ROOT, 'src', 'adapter', 'plugin.ts');
const MANIFEST_PATH = path.join(PLUGIN_ROOT, 'openclaw.plugin.json');

function readAdapterSource(): string {
  return readFileSync(ADAPTER_PATH, 'utf8');
}

function readManifest(): {
  description: string;
  activation: { onStartup: boolean; onCapabilities: string[] };
} {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

test('adapter no longer imports failedTextResult/payloadTextResult from openclaw/plugin-sdk/core (missing-export regression guard)', () => {
  const source = readAdapterSource();
  const coreImport = source.match(/import\s*\{([^}]*)\}\s*from\s*'openclaw\/plugin-sdk\/core'/);
  if (coreImport) {
    assert.equal(
      /failedTextResult/.test(coreImport[1] ?? ''),
      false,
      'core does not export failedTextResult',
    );
    assert.equal(
      /payloadTextResult/.test(coreImport[1] ?? ''),
      false,
      'core does not export payloadTextResult',
    );
  }
});

test('adapter imports failedTextResult and payloadTextResult from openclaw/plugin-sdk/agent-runtime', () => {
  const source = readAdapterSource();
  const agentRuntimeImport = source.match(
    /import\s*\{([^}]*)\}\s*from\s*'openclaw\/plugin-sdk\/agent-runtime'/,
  );
  assert.ok(agentRuntimeImport, 'expected an import from openclaw/plugin-sdk/agent-runtime');
  const names = agentRuntimeImport![1] ?? '';
  assert.match(names, /\bfailedTextResult\b/);
  assert.match(names, /\bpayloadTextResult\b/);
});

test('adapter passes an explicit activation block to defineToolPlugin that matches openclaw.plugin.json (stale-metadata regression guard)', () => {
  const source = readAdapterSource();
  const manifest = readManifest();

  const activationBlockMatch = source.match(
    /activation:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*configSchema:/,
  );
  assert.ok(
    activationBlockMatch,
    'expected an explicit "activation" field passed into defineToolPlugin(...)',
  );
  const activationBlock = activationBlockMatch![1] ?? '';

  const onStartupMatch = activationBlock.match(/onStartup:\s*(true|false)/);
  assert.ok(onStartupMatch, 'expected an explicit onStartup value in the source activation block');
  assert.equal(onStartupMatch![1] === 'true', manifest.activation.onStartup);

  const onCapabilitiesMatch = activationBlock.match(/onCapabilities:\s*\[([^\]]*)\]/);
  assert.ok(
    onCapabilitiesMatch,
    'expected an explicit onCapabilities array in the source activation block',
  );
  const sourceCapabilities = (onCapabilitiesMatch![1] ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  assert.deepEqual(sourceCapabilities, manifest.activation.onCapabilities);
});

test('openclaw.plugin.json declares the plugin as not started eagerly on Gateway startup', () => {
  const manifest = readManifest();
  assert.equal(manifest.activation.onStartup, false);
});

test('manifest description matches the source description passed to defineToolPlugin verbatim (stale-manifest regression guard)', () => {
  const source = readAdapterSource();
  const manifest = readManifest();

  const descriptionMatch = source.match(
    /export default defineToolPlugin\(\{[\s\S]*?description:\s*\n?\s*'((?:[^'\\]|\\.)*)'/,
  );
  assert.ok(descriptionMatch, 'expected a description field on the defineToolPlugin(...) call');
  const sourceDescription = (descriptionMatch![1] ?? '').replace(/\\'/g, "'");

  assert.equal(
    manifest.description,
    sourceDescription,
    'openclaw.plugin.json "description" must be regenerated with `openclaw plugins build` after changing the source description, not hand-edited independently',
  );
});
