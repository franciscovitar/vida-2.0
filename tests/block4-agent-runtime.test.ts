/**
 * Block 4 — contratos, estado sanitizado y diagnóstico del Guardián técnico.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

import { listOpenClawAgentManifests } from '@/lib/openclaw/agent-manifests';
import { buildCanonicalString, signCanonical } from '@/lib/openclaw/auth';
import { listOpenClawCapabilities } from '@/lib/openclaw/capabilities';
import { validateOpenClawReadBoundary } from '@/lib/openclaw/read-boundary';
import { validateOpenClawReadEnvelope } from '@/lib/openclaw/read-contract';
import { getOpenClawReadiness } from '@/lib/openclaw/readiness';
import {
  buildOpenClawTechnicalDiagnostics,
  buildOpenClawTechnicalStatus,
} from '@/lib/openclaw/technical';

const TECH_KEY_ID = 'technical-key';
const TECH_SECRET = 'technical-secret-private-value';

const ENV = {
  OPENCLAW_API_ENABLED: 'true',
  OPENCLAW_ACCESS_MODE: 'read-only',
  OPENCLAW_STEWARD_API_KEY_ID: 'steward-key',
  OPENCLAW_STEWARD_API_SECRET: 'steward-secret-private-value',
  OPENCLAW_HEALTH_REFLECTION_API_KEY_ID: 'health-key',
  OPENCLAW_HEALTH_REFLECTION_API_SECRET: 'health-secret-private-value',
  OPENCLAW_DIGITAL_ORDER_API_KEY_ID: 'digital-key',
  OPENCLAW_DIGITAL_ORDER_API_SECRET: 'digital-secret-private-value',
  OPENCLAW_TECHNICAL_GUARDIAN_API_KEY_ID: TECH_KEY_ID,
  OPENCLAW_TECHNICAL_GUARDIAN_API_SECRET: TECH_SECRET,
  NODE_ENV: 'test',
  OPENCLAW_RATE_LIMIT_MODE: 'memory',
  OPENCLAW_REPLAY_MODE: 'memory',
} as const;

async function withEnv<T>(env: Record<string, string>, fn: () => Promise<T> | T): Promise<T> {
  const keys = Object.keys(env);
  const previous = new Map<string, string | undefined>();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    process.env[key] = env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      const prev = previous.get(key);
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  }
}

function signedTechnicalRead(rawBody: string) {
  const timestamp = String(Date.now());
  const requestId = `req-tech-${Math.random().toString(16).slice(2)}`;
  const signature = signCanonical(
    TECH_SECRET,
    buildCanonicalString({
      timestamp,
      requestId,
      method: 'POST',
      pathname: '/api/openclaw/v1/read',
      rawBody,
    }),
  );
  return { timestamp, signature, requestId, keyId: TECH_KEY_ID };
}

async function loadReadRoutePost() {
  const loader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = loader._load;
  loader._load = function patchedLoad(request, parent, isMain) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const mod = await import('@/app/api/openclaw/v1/read/route');
    return mod.POST;
  } finally {
    loader._load = originalLoad;
  }
}

test('B4-T1: solo Guardián técnico recibe technical.status y technical.logs', () => {
  for (const id of ['steward', 'health-reflection', 'digital-order'] as const) {
    const caps = listOpenClawCapabilities(id, ENV);
    assert.equal(caps.find((item) => item.id === 'technical.status')?.kind, 'forbidden');
    assert.equal(caps.find((item) => item.id === 'technical.logs')?.kind, 'forbidden');
  }
  const guardian = listOpenClawCapabilities('technical-guardian', ENV);
  assert.equal(guardian.find((item) => item.id === 'technical.status')?.kind, 'read');
  assert.equal(guardian.find((item) => item.id === 'technical.logs')?.kind, 'read');
});

test('B4-T2: contratos técnicos aceptan solo input vacío', () => {
  assert.equal(validateOpenClawReadEnvelope({ operation: 'technical.status', input: {} }).ok, true);
  assert.equal(validateOpenClawReadEnvelope({ operation: 'technical.logs', input: {} }).ok, true);
  assert.equal(
    validateOpenClawReadEnvelope({ operation: 'technical.logs', input: { raw: true } }).ok,
    false,
  );
});

test('B4-T3: readiness reconoce credenciales especializadas sin exigir legacy global', () => {
  const readiness = getOpenClawReadiness(ENV);
  assert.equal(readiness.apiStatus, 'read-only');
  assert.equal(readiness.securityControls, 'ready');
  assert.equal(readiness.readers['technical.status'], 'ready');
  assert.equal(readiness.readers['technical.logs'], 'ready');
});

test('B4-T4: estado y diagnósticos nunca exponen secretos, key IDs o URLs', () => {
  const status = buildOpenClawTechnicalStatus(ENV);
  const diagnostics = buildOpenClawTechnicalDiagnostics({
    ...ENV,
    UPSTASH_REDIS_REST_URL: 'https://private-example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'upstash-private-token',
  });
  const json = JSON.stringify({ status, diagnostics });
  for (const forbidden of [
    'steward-secret-private-value',
    'technical-secret-private-value',
    'steward-key',
    'technical-key',
    'private-example.upstash.io',
    'upstash-private-token',
    'OPENCLAW_STEWARD_API_SECRET',
    'OPENCLAW_TECHNICAL_GUARDIAN_API_KEY_ID',
  ]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
  assert.equal(diagnostics.rawProviderLogs, false);
  assert.ok(diagnostics.entries.length <= 20);
});

test('B4-T4b: technical.status pasa la frontera con agentKey y sin clave id', () => {
  const status = buildOpenClawTechnicalStatus(ENV);
  assert.equal(validateOpenClawReadBoundary(status).ok, true);
  assert.equal(status.agents.length, 4);
  for (const agent of status.agents) {
    assert.equal(typeof agent.agentKey, 'string');
    assert.ok(agent.agentKey.length > 0);
    assert.equal(Object.hasOwn(agent, 'id'), false);
  }

  const diagnostics = buildOpenClawTechnicalDiagnostics(ENV);
  assert.equal(validateOpenClawReadBoundary(diagnostics).ok, true);
  assert.equal(diagnostics.rawProviderLogs, false);
  assert.ok(diagnostics.entries.length <= 20);
  for (const entry of diagnostics.entries) {
    assert.equal(Object.hasOwn(entry, 'id'), false);
    assert.match(entry.code, /^[a-z0-9-]+$/);
  }
});

test('B4-T4c: ruta real technical.status y technical.logs responden 200', async () => {
  const postRead = await loadReadRoutePost();
  await withEnv({ ...ENV }, async () => {
    for (const operation of ['technical.status', 'technical.logs'] as const) {
      const body = JSON.stringify({ operation, input: {} });
      const signed = signedTechnicalRead(body);
      const response = await postRead(
        new Request('https://example.test/api/openclaw/v1/read', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-vida-key-id': signed.keyId,
            'x-vida-timestamp': signed.timestamp,
            'x-vida-signature': signed.signature,
            'x-vida-request-id': signed.requestId,
          },
          body,
        }),
      );
      assert.equal(response.status, 200, operation);
      const json = (await response.json()) as {
        ok: boolean;
        operation: string;
        data: {
          agents?: Array<Record<string, unknown>>;
          rawProviderLogs?: boolean;
          entries?: unknown[];
        };
      };
      assert.equal(json.ok, true, operation);
      assert.equal(json.operation, operation);

      const serialized = JSON.stringify(json);
      for (const forbidden of [
        'steward-secret-private-value',
        'technical-secret-private-value',
        'steward-key',
        'technical-key',
        'OPENCLAW_TECHNICAL_GUARDIAN_API_KEY_ID',
        'https://',
        'http://',
      ]) {
        assert.equal(serialized.includes(forbidden), false, `${operation}:${forbidden}`);
      }

      if (operation === 'technical.status') {
        assert.ok(Array.isArray(json.data.agents));
        assert.equal(json.data.agents!.length, 4);
        for (const agent of json.data.agents!) {
          assert.equal(typeof agent.agentKey, 'string');
          assert.equal(Object.hasOwn(agent, 'id'), false);
        }
      } else {
        assert.equal(json.data.rawProviderLogs, false);
        assert.ok(Array.isArray(json.data.entries));
      }
    }
  });
});

test('B4-T5: los cuatro contratos niegan Journaling, direct writes y memoria persistente', () => {
  const manifests = listOpenClawAgentManifests();
  assert.equal(manifests.length, 4);
  for (const manifest of manifests) {
    assert.equal(manifest.externalAccess.journaling, 'denied');
    assert.equal(manifest.memoryPolicy, 'request-context-only');
    const rules = manifest.hardRules.join(' ');
    assert.match(rules, /No aprobar, rechazar, revertir ni ejecutar escrituras directas/);
    assert.match(rules, /No cambiar arquitectura/);
  }
});

test('B4-T6: Ajustes muestra agentes sin nombres de variables ni credenciales', () => {
  const source = readFileSync(path.join(process.cwd(), 'app/(app)/ajustes/page.tsx'), 'utf8');
  assert.match(source, /Agentes especializados/);
  assert.match(source, /getOpenClawAgentStatuses/);
  assert.doesNotMatch(source, /OPENCLAW_STEWARD_API_SECRET/);
  assert.doesNotMatch(source, /OPENCLAW_TECHNICAL_GUARDIAN_API_KEY_ID/);
});
