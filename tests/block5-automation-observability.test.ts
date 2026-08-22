import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  automationLogLooksSafe,
  buildAutomationLogEvent,
  emitAutomationLog,
} from '@/lib/automations/observability';

test('block5 observability: evento autorizado es acotado, trazable y sin identificadores crudos', () => {
  const runKey = 'run_abcdefghijklmnopqrstuvwx';
  const event = buildAutomationLogEvent({
    workflowKey: 'daily-briefing',
    principalKey: 'daily-briefing',
    runKey,
    operation: 'callback.result',
    status: 'succeeded',
    attempt: 99,
    durationMs: 2_000_000,
    resultCode: 'completed',
    itemCount: 99,
    at: '2026-08-01T12:00:00.000Z',
  });
  assert.equal(automationLogLooksSafe(event), true);
  assert.equal(event.attempt, 3);
  assert.equal(event.durationMs, 900_000);
  assert.equal(event.itemCount, 20);
  assert.match(event.principalTrace, /^[0-9a-f]{32}$/);
  assert.match(event.runTrace, /^[0-9a-f]{32}$/);
  assert.equal(JSON.stringify(event).includes(runKey), false);

  const lines: string[] = [];
  emitAutomationLog(event, (line) => lines.push(line));
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(lines[0]!) as object).sort(), [
    'at',
    'attempt',
    'durationMs',
    'itemCount',
    'operation',
    'principalTrace',
    'resultCode',
    'runTrace',
    'scope',
    'status',
    'workflowKey',
  ]);
});

test('block5 observability: eventos manipulados con secretos o claves extra no se emiten', () => {
  const base = buildAutomationLogEvent({
    workflowKey: 'weekly-review',
    principalKey: 'weekly-review',
    runKey: 'run_abcdefghijklmnopqrstuvwx',
    operation: 'runtime.dispatch',
    status: 'running',
    attempt: 1,
    durationMs: 1,
    resultCode: null,
  });
  const unsafe = { ...base, token: 'secret' } as typeof base;
  const lines: string[] = [];
  assert.equal(automationLogLooksSafe(unsafe), false);
  emitAutomationLog(unsafe, (line) => lines.push(line));
  assert.deepEqual(lines, []);
});
