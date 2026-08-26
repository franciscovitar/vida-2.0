/**
 * Regression guards for OpenClaw 2026.7.1-2 runtime-validated failures fixed
 * in the adapter (import path, activation metadata drift, SecretRef schema
 * acceptance). These are lightweight, deterministic, and do not require the
 * OpenClaw SDK to be installed -- they inspect the adapter source text and
 * the manifest JSON directly rather than duplicating OpenClaw's own
 * `openclaw plugins validate` / `config patch --dry-run` logic (that
 * official pipeline was exercised directly, against the real installed
 * runtime, in an isolated `--profile` with synthetic `exec` SecretRefs; see
 * docs/block-6-openclaw-plugin.md).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const PLUGIN_ROOT = path.join(__dirname, '..', 'openclaw-plugin', 'vida-2-0-api');
const ADAPTER_PATH = path.join(PLUGIN_ROOT, 'src', 'adapter', 'plugin.ts');
const MANIFEST_PATH = path.join(PLUGIN_ROOT, 'openclaw.plugin.json');

type JsonSchema = Record<string, unknown>;
type Manifest = {
  description: string;
  activation: { onStartup: boolean; onCapabilities: string[] };
  contracts: { tools: string[] };
  configContracts: { secretInputs: { paths: Array<{ path: string; expected?: string }> } };
  configSchema: {
    required: string[];
    properties: {
      baseUrl: JsonSchema;
      vercelProtectionBypass?: JsonSchema;
      agents: {
        properties: Record<string, { properties: { keyId: JsonSchema; secret: JsonSchema } }>;
      };
    };
  };
};

const VIDA_AGENT_IDS = [
  'steward',
  'health-reflection',
  'digital-order',
  'technical-guardian',
] as const;

function readAdapterSource(): string {
  return readFileSync(ADAPTER_PATH, 'utf8');
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

/** Asserts a generated field schema is exactly `string | closed SecretRef object`, never an arbitrary object. */
function assertSecretInputSchemaShape(schema: JsonSchema, label: string): void {
  const anyOf = schema.anyOf as JsonSchema[] | undefined;
  assert.ok(Array.isArray(anyOf) && anyOf.length === 2, `${label}: expected a two-branch anyOf`);

  const stringBranch = anyOf!.find((branch) => branch.type === 'string');
  assert.ok(stringBranch, `${label}: expected a plain-string branch`);

  const objectBranch = anyOf!.find((branch) => branch.type === 'object');
  assert.ok(objectBranch, `${label}: expected a SecretRef object branch`);
  assert.equal(
    objectBranch!.additionalProperties,
    false,
    `${label}: SecretRef branch must be closed`,
  );
  assert.deepEqual(
    [...(objectBranch!.required as string[])].sort(),
    ['id', 'provider', 'source'],
    `${label}: SecretRef branch must require exactly source/provider/id`,
  );

  const props = objectBranch!.properties as Record<string, JsonSchema>;
  const sourceEnum = (props.source!.anyOf as JsonSchema[]).map((v) => v.const);
  assert.deepEqual(
    [...sourceEnum].sort(),
    ['env', 'exec', 'file'],
    `${label}: SecretRef source must be exactly env|file|exec, no invented provider kind`,
  );
}

/** A structurally arbitrary object must fail this schema: it satisfies neither the string nor the closed SecretRef branch. */
function isRejectedByClosedSecretInputSchema(
  schema: JsonSchema,
  candidate: Record<string, unknown>,
): boolean {
  const anyOf = schema.anyOf as JsonSchema[];
  const objectBranch = anyOf.find((branch) => branch.type === 'object')!;
  const required = objectBranch.required as string[];
  const props = Object.keys(objectBranch.properties as Record<string, unknown>);
  const hasAllRequired = required.every((key) => key in candidate);
  const hasOnlyKnownKeys = Object.keys(candidate).every((key) => props.includes(key));
  return !(hasAllRequired && hasOnlyKnownKeys);
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

test('vercelProtectionBypass accepts a plain string or a closed OpenClaw SecretRef object (SecretRef schema regression guard)', () => {
  const manifest = readManifest();
  const schema = manifest.configSchema.properties.vercelProtectionBypass;
  assert.ok(schema, 'expected vercelProtectionBypass to remain in the generated config schema');
  assertSecretInputSchemaShape(schema!, 'vercelProtectionBypass');
});

test('vercelProtectionBypass remains optional, never required (fixed Vercel transport, not mandatory)', () => {
  const manifest = readManifest();
  assert.equal(manifest.configSchema.required.includes('vercelProtectionBypass'), false);
});

test('every agent keyId/secret accepts a plain string or a closed OpenClaw SecretRef object', () => {
  const manifest = readManifest();
  for (const agentId of VIDA_AGENT_IDS) {
    const agentSchema = manifest.configSchema.properties.agents.properties[agentId];
    assert.ok(agentSchema, `expected an agent schema for ${agentId}`);
    assertSecretInputSchemaShape(agentSchema!.properties.keyId, `agents.${agentId}.keyId`);
    assertSecretInputSchemaShape(agentSchema!.properties.secret, `agents.${agentId}.secret`);
  }
});

test('an arbitrary object is structurally rejected by every secret-bearing schema (no Type.Unknown/Type.Any escape hatch)', () => {
  const manifest = readManifest();
  const arbitrary = { foo: 'bar', arbitrary: true };
  const missingId = { source: 'exec', provider: 'b6fixture' };

  assert.equal(
    isRejectedByClosedSecretInputSchema(
      manifest.configSchema.properties.vercelProtectionBypass!,
      arbitrary,
    ),
    true,
  );
  assert.equal(
    isRejectedByClosedSecretInputSchema(
      manifest.configSchema.properties.vercelProtectionBypass!,
      missingId,
    ),
    true,
  );
  const stewardKeyId = manifest.configSchema.properties.agents.properties.steward!.properties.keyId;
  assert.equal(isRejectedByClosedSecretInputSchema(stewardKeyId, arbitrary), true);
});

test('baseUrl remains a plain string, never widened to accept a SecretRef (task boundary: baseUrl stays plain string)', () => {
  const manifest = readManifest();
  assert.equal(manifest.configSchema.properties.baseUrl.type, 'string');
  assert.equal('anyOf' in manifest.configSchema.properties.baseUrl, false);
});

test('configContracts.secretInputs still lists every secret-bearing path, including vercelProtectionBypass', () => {
  const manifest = readManifest();
  const paths = manifest.configContracts.secretInputs.paths.map((p) => p.path).sort();
  const expected = [
    'vercelProtectionBypass',
    ...VIDA_AGENT_IDS.flatMap((id) => [`agents.${id}.keyId`, `agents.${id}.secret`]),
  ].sort();
  assert.deepEqual(paths, expected);
});

test('the tool surface and capability set are unchanged by the SecretRef schema widening', () => {
  const manifest = readManifest();
  assert.deepEqual(manifest.contracts.tools, ['vida_operation']);
  assert.deepEqual(
    Object.keys(manifest.configSchema.properties.agents.properties).sort(),
    [...VIDA_AGENT_IDS].sort(),
  );
});

test('the vida_operation tool parameter schemas never declare agentId, credential, bypass, header, url, or method fields (tool-surface regression guard)', () => {
  const source = readAdapterSource();
  const forbidden = [
    'agentId',
    'keyId',
    'secret',
    'vercelProtectionBypass',
    'headers',
    "'url'",
    '"url"',
    'method',
  ];

  for (const schemaName of ['ReadCallSchema', 'ProposeCallSchema', 'HealthCallSchema']) {
    const match = source.match(
      new RegExp(`const ${schemaName} = Type\\.Object\\(\\{([\\s\\S]*?)\\n\\}\\);`),
    );
    assert.ok(match, `expected to find ${schemaName} in the adapter source`);
    const body = match![1] ?? '';
    for (const term of forbidden) {
      assert.equal(body.includes(term), false, `${schemaName} must not declare ${term}`);
    }
  }
});
