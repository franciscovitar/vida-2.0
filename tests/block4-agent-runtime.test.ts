/**
 * Block 4 — contratos, estado sanitizado y diagnóstico del Guardián técnico.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { listOpenClawAgentManifests } from '@/lib/openclaw/agent-manifests';
import { getOpenClawAgentStatuses } from '@/lib/openclaw/agent-status';
import { listOpenClawCapabilities } from '@/lib/openclaw/capabilities';
import { validateOpenClawReadEnvelope } from '@/lib/openclaw/read-contract';
import { getOpenClawReadiness } from '@/lib/openclaw/readiness';
import {
  buildOpenClawTechnicalDiagnostics,
  buildOpenClawTechnicalStatus,
} from '@/lib/openclaw/technical';

const ENV = {
  OPENCLAW_API_ENABLED: 'true',
  OPENCLAW_ACCESS_MODE: 'read-only',
  OPENCLAW_STEWARD_API_KEY_ID: 'steward-key',
  OPENCLAW_STEWARD_API_SECRET: 'steward-secret-private-value',
  OPENCLAW_HEALTH_REFLECTION_API_KEY_ID: 'health-key',
  OPENCLAW_HEALTH_REFLECTION_API_SECRET: 'health-secret-private-value',
  OPENCLAW_DIGITAL_ORDER_API_KEY_ID: 'digital-key',
  OPENCLAW_DIGITAL_ORDER_API_SECRET: 'digital-secret-private-value',
  OPENCLAW_TECHNICAL_GUARDIAN_API_KEY_ID: 'technical-key',
  OPENCLAW_TECHNICAL_GUARDIAN_API_SECRET: 'technical-secret-private-value',
  NODE_ENV: 'test',
  OPENCLAW_RATE_LIMIT_MODE: 'memory',
  OPENCLAW_REPLAY_MODE: 'memory',
} as const;

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
  ]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
  assert.equal(diagnostics.rawProviderLogs, false);
  assert.ok(diagnostics.entries.length <= 20);
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
