import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BUSINESS_ACTION_TYPES, isPublicControlAction } from '@/lib/actions/policy';
import {
  CONVERSATIONAL_CAPTURE_CHANNELS,
  getVidaConversationalCaptureCapability,
  getVidaConversationalCapturePolicy,
  listVidaConversationalCaptureCapabilities,
} from '@/lib/capture/contracts';

test('CAP1. V1 covers exactly the registered Safe Writes business actions', () => {
  const operations = listVidaConversationalCaptureCapabilities().map((item) => item.operation);
  assert.deepEqual(operations, [...BUSINESS_ACTION_TYPES]);
  assert.equal(new Set(operations).size, operations.length);
});

test('CAP2. conversational capture never registers public control actions as user intents', () => {
  for (const capability of listVidaConversationalCaptureCapabilities()) {
    assert.equal(isPublicControlAction(capability.operation), false);
  }
});

test('CAP3. daily capture does not originate from Vida Web', () => {
  for (const capability of listVidaConversationalCaptureCapabilities()) {
    assert.equal(capability.webOriginatingSurface, false);
  }
});

test('CAP4. V1 preserves the current proposal-only execution boundary', () => {
  for (const capability of listVidaConversationalCaptureCapabilities()) {
    assert.equal(capability.executionMode, 'proposal-only');
    assert.equal(capability.directApplyEnabled, false);
  }
});

test('CAP5. risk and confirmation remain owned by the canonical Policy Engine', () => {
  assert.deepEqual(getVidaConversationalCapturePolicy('inbox.capture'), {
    confirmation: 'explicit',
    risk: 'low',
    reversible: true,
  });
  assert.deepEqual(getVidaConversationalCapturePolicy('task.create'), {
    confirmation: 'explicit',
    risk: 'medium',
    reversible: true,
  });
  assert.deepEqual(getVidaConversationalCapturePolicy('calendar.hold.create'), {
    confirmation: 'explicit',
    risk: 'medium',
    reversible: true,
  });
});

test('CAP6. channel list is transport-only and starts ChatGPT-first', () => {
  assert.deepEqual(CONVERSATIONAL_CAPTURE_CHANNELS, [
    'chatgpt',
    'telegram',
    'whatsapp',
    'other',
  ]);
});

test('CAP7. canonical authority is singular per operation', () => {
  assert.equal(getVidaConversationalCaptureCapability('task.create').authority, 'notion-tasks');
  assert.equal(getVidaConversationalCaptureCapability('inbox.capture').authority, 'notion-inbox');
  assert.equal(
    getVidaConversationalCaptureCapability('gym.session.create').authority,
    'sheets-gym',
  );
  assert.equal(
    getVidaConversationalCaptureCapability('calendar.hold.create').authority,
    'google-calendar-holds',
  );
});
