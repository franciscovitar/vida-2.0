/**
 * Block 3D — business actions success + rollback ownership; gym partial→reverted; calendar holds.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { createMemoryAuditSink } from '@/lib/actions/audit';
import { createMemoryWriteCoordination } from '@/lib/actions/coordination';
import { createMemoryEncryptedPayloadStore } from '@/lib/actions/encryption';
import { executeAction } from '@/lib/actions/engine';
import { compensateBusiness } from '@/lib/actions/handlers';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import {
  createMemoryCalendarHoldPort,
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import { validateCalendarHoldCreate } from '@/lib/actions/payloads';
import { requestFromEmail } from '@/lib/actions/request';
import type { ActionConfirmation, ActionRequest, ProposalCreatePayload } from '@/types/actions';

const explicit: ActionConfirmation = { mode: 'explicit', acknowledged: true, phrase: null };
const approveConfirm: ActionConfirmation = {
  mode: 'reinforced',
  acknowledged: true,
  phrase: 'aprobar',
};
const rollbackConfirm: ActionConfirmation = {
  mode: 'reinforced',
  acknowledged: true,
  phrase: 'revertir',
};

function makeDeps(overrides?: {
  tasks?: ReturnType<typeof createMemoryTaskPort>;
  inbox?: ReturnType<typeof createMemoryInboxPort>;
  gym?: ReturnType<typeof createMemoryGymPort>;
  calendar?: ReturnType<typeof createMemoryCalendarHoldPort>;
  proposals?: ReturnType<typeof createMemoryProposalPort>;
}) {
  const encryptionKey = randomBytes(32);
  const encryptionStore = createMemoryEncryptedPayloadStore();
  const coordination = createMemoryWriteCoordination();
  const tasks =
    overrides?.tasks ?? createMemoryTaskPort({ areaProjectMap: { 'proj-salud': 'area.salud' } });
  const inbox = overrides?.inbox ?? createMemoryInboxPort();
  const gym = overrides?.gym ?? createMemoryGymPort();
  const calendar = overrides?.calendar ?? createMemoryCalendarHoldPort();
  const proposals = overrides?.proposals ?? createMemoryProposalPort();
  return {
    writesEnabled: true as const,
    idempotency: createMemoryIdempotencyStore(),
    audit: createMemoryAuditSink(),
    coordination,
    handlers: {
      tasks,
      inbox,
      gym,
      proposals,
      calendar,
      encryptionStore,
      encryptionKey,
      coordination,
      approvalTtlSeconds: 86_400,
      rollbackWindowSeconds: 604_800,
      now: () => '2026-07-28T12:00:00.000Z',
    },
    ports: { tasks, inbox, gym, calendar, proposals },
  };
}

function request(
  partial: Partial<ActionRequest> &
    Pick<ActionRequest, 'actionType' | 'payload' | 'idempotencyKey'>,
): ActionRequest {
  return requestFromEmail('user@example.com', {
    confirmation: explicit,
    expectedPrevious: null,
    context: { source: 'web', targetDate: '2026-07-28' },
    ...partial,
  });
}

async function createApproveRollback(
  d: ReturnType<typeof makeDeps>,
  proposal: ProposalCreatePayload,
  idBase: string,
) {
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: `${idBase}-c`,
      payload: proposal,
    }),
    d,
  );
  assert.equal(created.ok, true, created.message);
  assert.ok(created.target?.key);
  const key = created.target.key;
  const approved = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: `${idBase}-a`,
      confirmation: approveConfirm,
      payload: { proposalKey: key },
    }),
    d,
  );
  assert.equal(approved.ok, true, approved.message);
  const rolled = await executeAction(
    request({
      actionType: 'action.rollback',
      idempotencyKey: `${idBase}-r`,
      confirmation: rollbackConfirm,
      payload: { proposalKey: key },
    }),
    d,
  );
  return { key, approved, rolled };
}

test('B3D-01. task.create success + ownership rollback', async () => {
  const d = makeDeps();
  const { rolled } = await createApproveRollback(
    d,
    {
      name: 'Nueva tarea',
      proposedActionType: 'task.create',
      targetType: 'task',
      targetKey: null,
      reason: 'r',
      expectedChange: 'crear',
      risk: 'medium',
      reversible: true,
      payload: {
        title: 'Block3 task',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    },
    'b3d-task',
  );
  assert.equal(rolled.code, 'rolled-back');
  const remaining = [...d.ports.tasks.tasks.values()].filter((t) => !t.archived);
  assert.equal(remaining.length, 0);
});

test('B3D-02. inbox.capture success + ownership rollback', async () => {
  const d = makeDeps();
  const { rolled } = await createApproveRollback(
    d,
    {
      name: 'Inbox',
      proposedActionType: 'inbox.capture',
      targetType: 'inbox',
      targetKey: null,
      reason: 'r',
      expectedChange: 'c',
      risk: 'low',
      reversible: true,
      payload: {
        text: 'captura b3',
        link: null,
        capturedAt: '2026-07-28T12:00:00.000Z',
        origin: 'web',
      },
    },
    'b3d-inbox',
  );
  assert.equal(rolled.code, 'rolled-back');
  const present = [...d.ports.inbox.captures.values()].filter((c) => !c.archived);
  assert.equal(present.length, 0);
});

test('B3D-03. rollback fails without ownership', async () => {
  const d = makeDeps();
  const created = await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'b3d-own',
      payload: {
        title: 'Direct',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    d,
  );
  assert.equal(created.ok, true);
  assert.ok(created.target?.key);
  const key = created.target.key;
  const compensated = await compensateBusiness({
    actionType: 'task.create',
    targetKey: key,
    ownership: 'wrong-ownership-token',
    deps: d.handlers,
  });
  assert.equal(compensated.ok, false);
});

test('B3D-04. gym partial then markReverted', async () => {
  const gym = createMemoryGymPort({ failSetsAfter: 1 });
  const d = makeDeps({ gym });
  const result = await executeAction(
    request({
      actionType: 'gym.session.create',
      idempotencyKey: 'b3d-gym-partial',
      payload: {
        date: '2026-07-28',
        routineKey: 'r',
        workoutDayKey: 'a',
        startedAt: null,
        finishedAt: null,
        durationMinutes: null,
        energyBefore: null,
        notes: null,
        sets: [
          {
            exerciseKey: 'e1',
            exerciseName: 'Press',
            setIndex: 1,
            weight: 40,
            reps: 8,
            rir: 2,
            rpe: 8,
            completed: true,
            notes: null,
          },
          {
            exerciseKey: 'e1',
            exerciseName: 'Press',
            setIndex: 2,
            weight: 40,
            reps: 8,
            rir: 2,
            rpe: 8,
            completed: true,
            notes: null,
          },
        ],
      },
    }),
    d,
  );
  assert.equal(result.code, 'partial');
  assert.ok(result.target?.key);
  const sessionId = result.target.key;
  assert.equal(gym.sessions.get(sessionId)?.status, 'partial');
  const reverted = await gym.markReverted(sessionId);
  assert.equal(reverted.ok, true);
  assert.equal(gym.sessions.get(sessionId)?.status, 'reverted');
});

test('B3D-05. gym complete + proposal rollback → reverted', async () => {
  const gym = createMemoryGymPort();
  const d = makeDeps({ gym });
  const { rolled } = await createApproveRollback(
    d,
    {
      name: 'Gym',
      proposedActionType: 'gym.session.create',
      targetType: 'gym-session',
      targetKey: null,
      reason: 'r',
      expectedChange: 'sets',
      risk: 'medium',
      reversible: true,
      payload: {
        date: '2026-07-28',
        routineKey: 'r',
        workoutDayKey: 'a',
        startedAt: null,
        finishedAt: null,
        durationMinutes: 40,
        energyBefore: 3,
        notes: null,
        sets: [
          {
            exerciseKey: 'e1',
            exerciseName: 'Squat',
            setIndex: 1,
            weight: 60,
            reps: 5,
            rir: 1,
            rpe: 9,
            completed: true,
            notes: null,
          },
        ],
      },
    },
    'b3d-gym-ok',
  );
  assert.equal(rolled.code, 'rolled-back');
  const statuses = [...gym.sessions.values()].map((s) => s.status);
  assert.ok(statuses.includes('reverted'));
});

test('B3D-06. calendar hold constraints + owned delete rollback', async () => {
  assert.equal(
    validateCalendarHoldCreate({
      title: 'Corto',
      start: '2027-08-01T10:00:00.000Z',
      end: '2027-08-01T10:10:00.000Z',
    }).ok,
    false,
  );
  assert.equal(
    validateCalendarHoldCreate({
      title: 'Largo',
      start: '2027-08-01T10:00:00.000Z',
      end: '2027-08-01T15:00:00.000Z',
    }).ok,
    false,
  );
  assert.equal(
    validateCalendarHoldCreate({
      title: 'Pasado',
      start: '2020-08-01T10:00:00.000Z',
      end: '2020-08-01T11:00:00.000Z',
    }).ok,
    false,
  );

  const calendar = createMemoryCalendarHoldPort();
  const d = makeDeps({ calendar });
  const { rolled } = await createApproveRollback(
    d,
    {
      name: 'Hold',
      proposedActionType: 'calendar.hold.create',
      targetType: 'calendar-hold',
      targetKey: null,
      reason: 'focus',
      expectedChange: '60m',
      risk: 'medium',
      reversible: true,
      payload: {
        title: 'Bloque foco B3',
        start: '2027-08-01T10:00:00.000Z',
        end: '2027-08-01T11:00:00.000Z',
        note: null,
        relatedTaskKey: null,
      },
    },
    'b3d-cal',
  );
  assert.equal(rolled.code, 'rolled-back');
  assert.equal([...calendar.holds.values()].filter((h) => !h.deleted).length, 0);

  const badOwnership = await calendar.deleteHoldWithOwnership('missing', 'x');
  assert.equal(badOwnership.ok, true);
  if (badOwnership.ok) assert.equal(badOwnership.outcome, 'already-absent');
});
