/**
 * Block 3 — emitter contracts: UI/OpenClaw payloads must match validators.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  validateCalendarHoldCreate,
  validateGymSessionCreate,
  validateInboxCapture,
  validateTaskChangeStatus,
  validateTaskCreate,
} from '@/lib/actions/payloads';
import { INBOX_CAPTURE_ORIGINS, type InboxCapturePayload } from '@/types/actions';

const root = process.cwd();

function source(...parts: string[]): string {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

test('B3-EMIT-01. inbox origins allowlist from canonical constant', () => {
  assert.deepEqual([...INBOX_CAPTURE_ORIGINS], ['web', 'openclaw', 'chatgpt', 'manual', 'import']);
  for (const origin of INBOX_CAPTURE_ORIGINS) {
    const parsed = validateInboxCapture({
      text: 'captura válida',
      link: null,
      capturedAt: '2030-01-01T12:00:00.000Z',
      origin,
    });
    assert.equal(parsed.ok, true, origin);
  }
});

test('B3-EMIT-02. web-bandeja and unknown origins are rejected', () => {
  const bad = validateInboxCapture({
    text: 'captura',
    link: null,
    capturedAt: '2030-01-01T12:00:00.000Z',
    origin: 'web-bandeja',
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.message, /Origen de captura no permitido/);

  const emptyDefault = validateInboxCapture({
    text: 'captura',
    link: null,
    capturedAt: '2030-01-01T12:00:00.000Z',
  });
  assert.equal(emptyDefault.ok, true);
  if (emptyDefault.ok) assert.equal(emptyDefault.value.origin, 'web');

  const unknownField = validateInboxCapture({
    text: 'captura',
    link: null,
    capturedAt: '2030-01-01T12:00:00.000Z',
    origin: 'web',
    extra: true,
  });
  assert.equal(unknownField.ok, false);
});

test('B3-EMIT-03. bandeja-equivalent payload with origin web passes', () => {
  const payload: InboxCapturePayload = {
    text: 'QA contrato bandeja',
    link: null,
    capturedAt: '2030-07-28T15:00:00.000Z',
    origin: 'web',
  };
  const parsed = validateInboxCapture(payload);
  assert.equal(parsed.ok, true);
});

test('B3-EMIT-04. InboxCapturePanel emits typed origin web, never web-bandeja', () => {
  const panel = source('components', 'actions', 'InboxCapturePanel.tsx');
  assert.match(panel, /InboxCapturePayload/);
  assert.match(panel, /origin:\s*'web'/);
  assert.equal(panel.includes('web-bandeja'), false);
});

test('B3-EMIT-05. other web emitters build typed business payloads', () => {
  const writes = source('components', 'actions', 'WritePanels.tsx');
  const gym = source('components', 'actions', 'GymSessionPanel.tsx');
  assert.match(writes, /TaskCreatePayload/);
  assert.match(writes, /TaskChangeStatusPayload/);
  assert.match(writes, /CalendarHoldCreatePayload/);
  assert.match(gym, /GymSessionCreatePayload/);

  assert.equal(
    validateTaskCreate({
      title: 'Tarea contrato',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    }).ok,
    true,
  );

  assert.equal(
    validateTaskCreate({
      title: 'ab',
      priority: 'Media',
      areaKey: 'area.salud',
    }).ok,
    false,
  );

  assert.equal(
    validateTaskChangeStatus({
      taskKey: 'task-1',
      nextStatus: 'Hecha',
    }).ok,
    true,
  );

  assert.equal(
    validateTaskChangeStatus({
      taskKey: 'task-1',
      nextStatus: 'Inventado',
    }).ok,
    false,
  );

  assert.equal(
    validateGymSessionCreate({
      date: '2030-01-02',
      routineKey: 'r1',
      workoutDayKey: 'd1',
      startedAt: null,
      finishedAt: null,
      durationMinutes: 45,
      energyBefore: 3,
      notes: null,
      sets: [
        {
          exerciseKey: 'ex1',
          exerciseName: 'Press',
          setIndex: 1,
          weight: 40,
          reps: 8,
          rir: 2,
          rpe: null,
          completed: true,
          notes: null,
        },
      ],
    }).ok,
    true,
  );

  assert.equal(
    validateGymSessionCreate({
      date: 'bad',
      routineKey: 'r1',
      workoutDayKey: 'd1',
      sets: [],
    }).ok,
    false,
  );

  const futureStart = new Date(Date.now() + 3_600_000).toISOString();
  const futureEnd = new Date(Date.now() + 7_200_000).toISOString();
  assert.equal(
    validateCalendarHoldCreate({
      title: 'Hold QA',
      start: futureStart,
      end: futureEnd,
      note: null,
      relatedTaskKey: null,
    }).ok,
    true,
  );

  assert.equal(
    validateCalendarHoldCreate({
      title: 'Hold QA',
      start: futureEnd,
      end: futureStart,
      note: null,
      relatedTaskKey: null,
    }).ok,
    false,
  );
});
