/**
 * Block 4 — identidad canónica, credenciales múltiples y capacidades por perfil.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getOpenClawAgentCredentials,
  getOpenClawAgentProfile,
  isOpenClawProposalAllowed,
  isOpenClawReadAllowed,
} from '@/lib/openclaw/agents';
import { buildCanonicalString, signCanonical, verifyOpenClawRequest } from '@/lib/openclaw/auth';
import { listOpenClawCapabilities } from '@/lib/openclaw/capabilities';

const BASE = {
  OPENCLAW_API_ENABLED: 'true',
  OPENCLAW_ACCESS_MODE: 'read-only',
  NODE_ENV: 'test',
};

function specializedEnv() {
  return {
    ...BASE,
    OPENCLAW_STEWARD_API_KEY_ID: 'steward-key',
    OPENCLAW_STEWARD_API_SECRET: 'steward-secret-32-characters-long',
    OPENCLAW_HEALTH_REFLECTION_API_KEY_ID: 'health-key',
    OPENCLAW_HEALTH_REFLECTION_API_SECRET: 'health-secret-32-characters-long',
    OPENCLAW_DIGITAL_ORDER_API_KEY_ID: 'digital-key',
    OPENCLAW_DIGITAL_ORDER_API_SECRET: 'digital-secret-32-characters-long',
    OPENCLAW_TECHNICAL_GUARDIAN_API_KEY_ID: 'technical-key',
    OPENCLAW_TECHNICAL_GUARDIAN_API_SECRET: 'technical-secret-32-characters',
  };
}

function verifyFor(input: {
  keyId: string;
  secret: string;
  requestId: string;
  env: Record<string, string>;
}) {
  const timestamp = String(Date.now());
  const signature = signCanonical(
    input.secret,
    buildCanonicalString({
      timestamp,
      requestId: input.requestId,
      method: 'GET',
      pathname: '/api/openclaw/v1/health',
      rawBody: '',
    }),
  );
  return verifyOpenClawRequest({
    env: input.env,
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
    keyIdHeader: input.keyId,
    timestampHeader: timestamp,
    signatureHeader: signature,
    requestIdHeader: input.requestId,
  });
}

test('B4-A1: perfiles canónicos cerrados y sin capacidades cruzadas', () => {
  const steward = getOpenClawAgentProfile('steward');
  const health = getOpenClawAgentProfile('health-reflection');
  const digital = getOpenClawAgentProfile('digital-order');
  const technical = getOpenClawAgentProfile('technical-guardian');

  assert.equal(steward.name, 'Mayordomo');
  assert.equal(health.areaScopes.join(','), 'salud');
  assert.deepEqual(digital.allowedReads, []);
  assert.deepEqual(technical.allowedProposals, []);

  assert.equal(isOpenClawReadAllowed('steward', 'tasks.list'), true);
  assert.equal(isOpenClawReadAllowed('health-reflection', 'tasks.list'), false);
  assert.equal(isOpenClawReadAllowed('health-reflection', 'gym.summary'), true);
  assert.equal(isOpenClawProposalAllowed('steward', 'gym.session.create.propose'), false);
  assert.equal(isOpenClawProposalAllowed('health-reflection', 'gym.session.create.propose'), true);
});

test('B4-A2: credenciales especializadas completas y key IDs únicas', () => {
  const resolved = getOpenClawAgentCredentials(specializedEnv());
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.credentials.length, 4);
    assert.deepEqual(
      resolved.credentials.map((item) => item.agentId),
      ['steward', 'health-reflection', 'digital-order', 'technical-guardian'],
    );
  }

  const duplicate = getOpenClawAgentCredentials({
    ...specializedEnv(),
    OPENCLAW_HEALTH_REFLECTION_API_KEY_ID: 'steward-key',
  });
  assert.deepEqual(duplicate, { ok: false, reason: 'duplicate-key-id' });

  const incomplete = getOpenClawAgentCredentials({
    ...BASE,
    OPENCLAW_STEWARD_API_KEY_ID: 'only-key',
  });
  assert.deepEqual(incomplete, { ok: false, reason: 'incomplete-credentials' });
});

test('B4-A3: credencial global histórica migra únicamente a steward', () => {
  const resolved = getOpenClawAgentCredentials({
    ...BASE,
    OPENCLAW_API_KEY_ID: 'legacy-key',
    OPENCLAW_API_SECRET: 'legacy-secret',
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.deepEqual(resolved.credentials, [
      { agentId: 'steward', keyId: 'legacy-key', secret: 'legacy-secret' },
    ]);
  }
});

test('B4-A4: HMAC resuelve AgentId canónico y actor inmutable', () => {
  const env = specializedEnv();
  const steward = verifyFor({
    keyId: 'steward-key',
    secret: env.OPENCLAW_STEWARD_API_SECRET,
    requestId: 'req-steward',
    env,
  });
  assert.equal(steward.ok, true);
  if (steward.ok) {
    assert.equal(steward.agentId, 'steward');
    assert.equal(steward.actorId, 'agent:steward');
  }

  const health = verifyFor({
    keyId: 'health-key',
    secret: env.OPENCLAW_HEALTH_REFLECTION_API_SECRET,
    requestId: 'req-health',
    env,
  });
  assert.equal(health.ok, true);
  if (health.ok) {
    assert.equal(health.agentId, 'health-reflection');
    assert.equal(health.actorId, 'agent:health-reflection');
  }
});

test('B4-A5: capabilities se filtran por agente y controles siguen prohibidos', () => {
  const env = {
    ...specializedEnv(),
    WRITE_ACTIONS_ENABLED: 'true',
    OPENCLAW_PROPOSALS_ENABLED: 'true',
  };

  const steward = listOpenClawCapabilities('steward', env);
  assert.equal(steward.find((item) => item.id === 'tasks.list')?.kind, 'read');
  assert.equal(
    steward.find((item) => item.id === 'calendar.hold.create.propose')?.kind,
    'proposal',
  );
  assert.equal(steward.find((item) => item.id === 'gym.session.create.propose')?.kind, 'forbidden');

  const health = listOpenClawCapabilities('health-reflection', env);
  assert.equal(health.find((item) => item.id === 'gym.summary')?.kind, 'read');
  assert.equal(health.find((item) => item.id === 'tasks.list')?.kind, 'forbidden');
  assert.equal(health.find((item) => item.id === 'gym.session.create.propose')?.kind, 'proposal');

  for (const agentId of [
    'steward',
    'health-reflection',
    'digital-order',
    'technical-guardian',
  ] as const) {
    const caps = listOpenClawCapabilities(agentId, env);
    assert.equal(caps.find((item) => item.id === 'proposal.approve')?.kind, 'forbidden');
    assert.equal(caps.find((item) => item.id === 'action.rollback')?.kind, 'forbidden');
    assert.equal(caps.find((item) => item.id === 'journaling.read')?.kind, 'forbidden');
    assert.equal(caps.find((item) => item.id === 'gmail.read')?.kind, 'forbidden');
    assert.equal(caps.find((item) => item.id === 'drive.read')?.kind, 'forbidden');
  }
});
