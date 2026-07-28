/**
 * Block 3E — public boundary: business actions denied via isPublicControlAction gate.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BUSINESS_ACTION_TYPES,
  PUBLIC_CONTROL_ACTIONS,
  isBusinessActionType,
  isPublicControlAction,
} from '@/lib/actions/policy';

/**
 * Equivalente a la puerta pública de runWriteAction (control plane only).
 * Las acciones de negocio solo corren dentro de proposal.approve.
 */
function publicWriteGate(actionType: string): {
  ok: boolean;
  code?: 'policy-denied';
  message?: string;
} {
  if (!isPublicControlAction(actionType)) {
    return {
      ok: false,
      code: 'policy-denied',
      message: 'Acción de negocio denegada en la puerta pública.',
    };
  }
  return { ok: true };
}

test('B3E-01. isPublicControlAction allowlist', () => {
  for (const action of PUBLIC_CONTROL_ACTIONS) {
    assert.equal(isPublicControlAction(action), true);
  }
  assert.equal(isPublicControlAction('task.create'), false);
  assert.equal(isPublicControlAction('calendar.event.create'), false);
});

test('B3E-02. business actions denied at public gate', () => {
  for (const action of BUSINESS_ACTION_TYPES) {
    assert.equal(isBusinessActionType(action), true);
    assert.equal(isPublicControlAction(action), false);
    const gate = publicWriteGate(action);
    assert.equal(gate.ok, false);
    assert.equal(gate.code, 'policy-denied');
  }
});

test('B3E-03. control actions allowed at public gate', () => {
  for (const action of PUBLIC_CONTROL_ACTIONS) {
    assert.equal(publicWriteGate(action).ok, true);
  }
});
