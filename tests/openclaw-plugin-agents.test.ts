import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getVidaAgentProfile,
  hasAnyDataCapability,
  isOperationAllowedForAgent,
  isVidaAgentId,
  listAllowedOperationsForAgent,
} from '../openclaw-plugin/vida-2-0-api/src/agents';
import { VIDA_AGENT_IDS } from '../openclaw-plugin/vida-2-0-api/src/types';

test('only the four canonical Vida agent ids are recognized; no planner or technical-watchdog principal', () => {
  assert.deepEqual([...VIDA_AGENT_IDS].sort(), [
    'digital-order',
    'health-reflection',
    'steward',
    'technical-guardian',
  ]);
  assert.equal(isVidaAgentId('steward'), true);
  assert.equal(isVidaAgentId('health-reflection'), true);
  assert.equal(isVidaAgentId('digital-order'), true);
  assert.equal(isVidaAgentId('technical-guardian'), true);
  assert.equal(
    isVidaAgentId('planner'),
    false,
    'planner must never be a recognized OpenClaw principal',
  );
  assert.equal(
    isVidaAgentId('technical-watchdog'),
    false,
    'technical-watchdog must never be a recognized OpenClaw principal',
  );
});

test('steward capability boundary matches the mirrored Vida profile exactly', () => {
  const profile = getVidaAgentProfile('steward');
  assert.deepEqual(
    [...profile.allowedReads].sort(),
    [
      'areas.get',
      'areas.list',
      'approvals.list',
      'calendar.upcoming',
      'document.get',
      'documents.search',
      'projects.list',
      'system.overview',
      'tasks.list',
    ].sort(),
  );
  assert.deepEqual(
    [...profile.allowedProposals].sort(),
    [
      'calendar.hold.create.propose',
      'inbox.capture.propose',
      'task.change-status.propose',
      'task.create.propose',
    ].sort(),
  );
  // Out of scope for steward:
  assert.equal(isOperationAllowedForAgent('steward', 'technical.status'), false);
  assert.equal(isOperationAllowedForAgent('steward', 'gym.session.create.propose'), false);
});

test('health-reflection capability boundary matches the mirrored Vida profile exactly', () => {
  const profile = getVidaAgentProfile('health-reflection');
  assert.deepEqual(
    [...profile.allowedReads].sort(),
    ['approvals.list', 'areas.get', 'document.get', 'documents.search', 'gym.summary'].sort(),
  );
  assert.deepEqual([...profile.allowedProposals], ['gym.session.create.propose']);
  // Out of scope for health-reflection:
  assert.equal(isOperationAllowedForAgent('health-reflection', 'tasks.list'), false);
  assert.equal(isOperationAllowedForAgent('health-reflection', 'task.create.propose'), false);
  assert.equal(isOperationAllowedForAgent('health-reflection', 'technical.logs'), false);
});

test('technical-guardian capability boundary matches the mirrored Vida profile exactly', () => {
  const profile = getVidaAgentProfile('technical-guardian');
  assert.deepEqual([...profile.allowedReads].sort(), ['technical.logs', 'technical.status']);
  assert.deepEqual([...profile.allowedProposals], []);
  assert.equal(isOperationAllowedForAgent('technical-guardian', 'areas.list'), false);
  assert.equal(isOperationAllowedForAgent('technical-guardian', 'task.create.propose'), false);
});

test('digital-order remains fully inert: zero reads, zero proposals, no accidental capability', () => {
  const profile = getVidaAgentProfile('digital-order');
  assert.deepEqual([...profile.allowedReads], []);
  assert.deepEqual([...profile.allowedProposals], []);
  assert.equal(hasAnyDataCapability('digital-order'), false);

  for (const op of [
    'system.overview',
    'areas.list',
    'areas.get',
    'tasks.list',
    'projects.list',
    'calendar.upcoming',
    'gym.summary',
    'approvals.list',
    'documents.search',
    'document.get',
    'technical.status',
    'technical.logs',
    'task.create.propose',
    'task.change-status.propose',
    'inbox.capture.propose',
    'gym.session.create.propose',
    'calendar.hold.create.propose',
  ] as const) {
    assert.equal(
      isOperationAllowedForAgent('digital-order', op),
      false,
      `digital-order must not gain ${op}`,
    );
  }
  // Only the universal, data-free protocol check is allowed.
  assert.equal(isOperationAllowedForAgent('digital-order', 'system.health'), true);
  assert.deepEqual(listAllowedOperationsForAgent('digital-order'), ['system.health']);
});

test('an agent cannot impersonate another agent: the same operation is gated independently per trusted agent id', () => {
  // task.create.propose is allowed for steward but not for health-reflection,
  // technical-guardian, or digital-order. The dispatcher always evaluates
  // against the agentId it was given -- there is no "on behalf of" override.
  assert.equal(isOperationAllowedForAgent('steward', 'task.create.propose'), true);
  assert.equal(isOperationAllowedForAgent('health-reflection', 'task.create.propose'), false);
  assert.equal(isOperationAllowedForAgent('technical-guardian', 'task.create.propose'), false);
  assert.equal(isOperationAllowedForAgent('digital-order', 'task.create.propose'), false);

  // technical.logs is allowed only for technical-guardian.
  for (const agentId of VIDA_AGENT_IDS) {
    const expected = agentId === 'technical-guardian';
    assert.equal(
      isOperationAllowedForAgent(agentId, 'technical.logs'),
      expected,
      `technical.logs for ${agentId}`,
    );
  }
});

test('system.overview is available to steward only among the four canonical agents', () => {
  for (const agentId of VIDA_AGENT_IDS) {
    const expected = agentId === 'steward';
    assert.equal(
      isOperationAllowedForAgent(agentId, 'system.overview'),
      expected,
      `system.overview for ${agentId}`,
    );
  }
});
