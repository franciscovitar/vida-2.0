/**
 * Block 3 — operability matrix + preflight + sequential five-action E2E.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { createMemoryAuditSink } from '@/lib/actions/audit';
import { createMemoryWriteCoordination } from '@/lib/actions/coordination';
import { createMemoryEncryptedPayloadStore } from '@/lib/actions/encryption';
import { executeAction } from '@/lib/actions/engine';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import {
  createMemoryCalendarHoldPort,
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import { buildWriteOperabilityMatrix } from '@/lib/actions/operability';
import { requestFromEmail } from '@/lib/actions/request';
import type { ActionConfirmation, ActionRequest } from '@/types/actions';

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

const AREA = 'area-dev-salud';
const PROJ = 'proj-qa-bloque3';

function request(
  partial: Partial<ActionRequest> &
    Pick<ActionRequest, 'actionType' | 'payload' | 'idempotencyKey'>,
): ActionRequest {
  return requestFromEmail('qa@example.com', {
    confirmation: explicit,
    expectedPrevious: null,
    context: { source: 'web', targetDate: '2026-07-28' },
    ...partial,
  });
}

function bundle(options?: {
  tasks?: ReturnType<typeof createMemoryTaskPort>;
  inbox?: ReturnType<typeof createMemoryInboxPort>;
  gym?: ReturnType<typeof createMemoryGymPort>;
  calendar?: ReturnType<typeof createMemoryCalendarHoldPort>;
  proposals?: ReturnType<typeof createMemoryProposalPort>;
  encryptionStore?: ReturnType<typeof createMemoryEncryptedPayloadStore>;
}) {
  const encryptionKey = randomBytes(32);
  const encryptionStore = options?.encryptionStore ?? createMemoryEncryptedPayloadStore();
  const coordination = createMemoryWriteCoordination();
  const tasks =
    options?.tasks ??
    createMemoryTaskPort({
      authorizedAreas: [AREA],
      areaProjectMap: { [PROJ]: AREA },
    });
  const inbox = options?.inbox ?? createMemoryInboxPort();
  const gym = options?.gym ?? createMemoryGymPort();
  const calendar = options?.calendar ?? createMemoryCalendarHoldPort();
  const proposals = options?.proposals ?? createMemoryProposalPort();
  return {
    writesEnabled: true,
    idempotency: createMemoryIdempotencyStore(),
    audit: createMemoryAuditSink(),
    coordination,
    encryptionStore,
    tasks,
    inbox,
    gym,
    calendar,
    proposals,
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
  };
}

async function createAndApprove(
  d: ReturnType<typeof bundle>,
  proposalPayload: Record<string, unknown>,
  createKey: string,
  approveKey: string,
  expectedPrevious?: string | null,
) {
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: createKey,
      payload: proposalPayload,
      expectedPrevious: expectedPrevious ?? null,
    }),
    d,
  );
  assert.equal(created.ok, true, created.message);
  const proposalKey = created.target?.key;
  assert.ok(proposalKey);
  const approved = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: approveKey,
      payload: { proposalKey },
      confirmation: approveConfirm,
    }),
    d,
  );
  assert.equal(approved.ok, true, approved.message);
  return proposalKey!;
}

test('B3-OP-A. operability matrix ready / blocked variants without writes', async () => {
  const ready = await buildWriteOperabilityMatrix(
    {
      tasks: createMemoryTaskPort({ authorizedAreas: [AREA] }),
      inbox: createMemoryInboxPort(),
      gym: createMemoryGymPort(),
      calendar: createMemoryCalendarHoldPort(),
    },
    { WRITE_ACTIONS_ENABLED: 'true' },
  );
  assert.equal(ready.global, 'ready');
  assert.equal(
    ready.actions
      .find((a) => a.actionType === 'task.change-status')
      ?.issues.includes('no-task-fixture'),
    true,
  );

  const noAreas = await buildWriteOperabilityMatrix(
    {
      tasks: createMemoryTaskPort({ authorizedAreas: [] }),
      inbox: createMemoryInboxPort(),
      gym: createMemoryGymPort(),
      calendar: createMemoryCalendarHoldPort(),
    },
    { WRITE_ACTIONS_ENABLED: 'true' },
  );
  assert.equal(noAreas.actions.find((a) => a.actionType === 'task.create')?.state, 'blocked');

  const inboxDown = await buildWriteOperabilityMatrix(
    {
      tasks: createMemoryTaskPort({ authorizedAreas: [AREA] }),
      inbox: createMemoryInboxPort({ failReady: true }),
      gym: createMemoryGymPort(),
      calendar: createMemoryCalendarHoldPort(),
    },
    { WRITE_ACTIONS_ENABLED: 'true' },
  );
  assert.equal(inboxDown.actions.find((a) => a.actionType === 'inbox.capture')?.state, 'blocked');
  assert.notEqual(inboxDown.global, 'ready');

  const gymDown = await buildWriteOperabilityMatrix(
    {
      tasks: createMemoryTaskPort({ authorizedAreas: [AREA] }),
      inbox: createMemoryInboxPort(),
      gym: createMemoryGymPort({ failReady: true }),
      calendar: createMemoryCalendarHoldPort(),
    },
    { WRITE_ACTIONS_ENABLED: 'true' },
  );
  assert.equal(
    gymDown.actions.find((a) => a.actionType === 'gym.session.create')?.state,
    'misconfigured',
  );

  const calDown = await buildWriteOperabilityMatrix(
    {
      tasks: createMemoryTaskPort({ authorizedAreas: [AREA] }),
      inbox: createMemoryInboxPort(),
      gym: createMemoryGymPort(),
      calendar: createMemoryCalendarHoldPort({ failReady: true }),
    },
    { WRITE_ACTIONS_ENABLED: 'true' },
  );
  assert.equal(
    calDown.actions.find((a) => a.actionType === 'calendar.hold.create')?.state,
    'blocked',
  );

  const disabled = await buildWriteOperabilityMatrix(
    {
      tasks: createMemoryTaskPort({ authorizedAreas: [AREA] }),
      inbox: createMemoryInboxPort(),
      gym: createMemoryGymPort(),
      calendar: createMemoryCalendarHoldPort(),
    },
    { WRITE_ACTIONS_ENABLED: 'false' },
  );
  assert.equal(disabled.global, 'disabled');
});

test('B3-OP-B. invalid preflight never encrypts or creates proposals', async () => {
  const encryptionStore = createMemoryEncryptedPayloadStore();
  const proposals = createMemoryProposalPort();
  const d = bundle({ encryptionStore, proposals });

  const cases: Array<{ key: string; payload: Record<string, unknown> }> = [
    {
      key: 'pf-area',
      payload: {
        name: 'Bad area',
        proposedActionType: 'task.create',
        targetType: 'task',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'medium',
        reversible: true,
        payload: {
          title: 'X',
          priority: 'Media',
          areaKey: 'area-missing',
          projectKey: null,
          date: null,
          duration: null,
          energy: null,
          note: null,
        },
      },
    },
    {
      key: 'pf-proj',
      payload: {
        name: 'Bad project',
        proposedActionType: 'task.create',
        targetType: 'task',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'medium',
        reversible: true,
        payload: {
          title: 'X',
          priority: 'Media',
          areaKey: AREA,
          projectKey: 'proj-other',
          date: null,
          duration: null,
          energy: null,
          note: null,
        },
      },
    },
    {
      key: 'pf-task-missing',
      payload: {
        name: 'Missing task',
        proposedActionType: 'task.change-status',
        targetType: 'task',
        targetKey: 'task-nope',
        reason: 'r',
        expectedChange: 'c',
        risk: 'low',
        reversible: true,
        payload: { taskKey: 'task-nope', nextStatus: 'Hecha' },
      },
    },
  ];

  for (const item of cases) {
    const result = await executeAction(
      request({
        actionType: 'proposal.create',
        idempotencyKey: item.key,
        payload: item.payload,
      }),
      d,
    );
    assert.equal(result.ok, false, item.key);
    assert.equal(encryptionStore.size(), 0, item.key);
    assert.equal(proposals.rows.size, 0, item.key);
  }

  const inboxFail = bundle({
    encryptionStore: createMemoryEncryptedPayloadStore(),
    proposals: createMemoryProposalPort(),
    inbox: createMemoryInboxPort({ failReady: true }),
  });
  const inboxResult = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'pf-inbox',
      payload: {
        name: 'Inbox',
        proposedActionType: 'inbox.capture',
        targetType: 'inbox',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'low',
        reversible: true,
        payload: {
          text: 'nota',
          link: null,
          capturedAt: '2026-07-28T12:00:00.000Z',
          origin: 'web',
        },
      },
    }),
    inboxFail,
  );
  assert.equal(inboxResult.ok, false);
  assert.equal(inboxFail.encryptionStore.size(), 0);

  const gymFail = bundle({
    encryptionStore: createMemoryEncryptedPayloadStore(),
    proposals: createMemoryProposalPort(),
    gym: createMemoryGymPort({ failReady: true }),
  });
  const gymResult = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'pf-gym',
      payload: {
        name: 'Gym',
        proposedActionType: 'gym.session.create',
        targetType: 'gym-session',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'medium',
        reversible: true,
        payload: {
          date: '2026-07-28',
          routineKey: 'r1',
          workoutDayKey: 'd1',
          startedAt: null,
          finishedAt: null,
          durationMinutes: 30,
          energyBefore: 3,
          notes: null,
          sets: [
            {
              exerciseKey: 'ex1',
              exerciseName: 'Press',
              setIndex: 1,
              weight: 40,
              reps: 8,
              rir: 1,
              rpe: null,
              completed: true,
              notes: null,
            },
          ],
        },
      },
    }),
    gymFail,
  );
  assert.equal(gymResult.ok, false);
  assert.equal(gymFail.encryptionStore.size(), 0);

  const calFail = bundle({
    encryptionStore: createMemoryEncryptedPayloadStore(),
    proposals: createMemoryProposalPort(),
    calendar: createMemoryCalendarHoldPort({ failReady: true }),
  });
  const start = '2030-01-01T15:00:00.000Z';
  const end = '2030-01-01T16:00:00.000Z';
  const calResult = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'pf-cal',
      payload: {
        name: 'Cal',
        proposedActionType: 'calendar.hold.create',
        targetType: 'calendar-hold',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'medium',
        reversible: true,
        payload: { title: 'Hold', start, end, note: null, relatedTaskKey: null },
      },
    }),
    calFail,
  );
  assert.equal(calResult.ok, false);
  assert.equal(calFail.encryptionStore.size(), 0);
});

test('B3-OP-C. sequential happy path for five actions with cleanup', async () => {
  const d = bundle();

  const inboxKey = await createAndApprove(
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
        text: 'captura e2e',
        link: null,
        capturedAt: '2026-07-28T12:00:00.000Z',
        origin: 'web',
      },
    },
    'e2e-inbox-c',
    'e2e-inbox-a',
  );
  const inboxRollback = await executeAction(
    request({
      actionType: 'action.rollback',
      idempotencyKey: 'e2e-inbox-r',
      payload: { proposalKey: inboxKey },
      confirmation: rollbackConfirm,
    }),
    d,
  );
  assert.equal(inboxRollback.ok, true);

  const taskCreateKey = await createAndApprove(
    d,
    {
      name: 'Task',
      proposedActionType: 'task.create',
      targetType: 'task',
      targetKey: null,
      reason: 'r',
      expectedChange: 'c',
      risk: 'medium',
      reversible: true,
      payload: {
        title: 'Tarea E2E',
        priority: 'Media',
        areaKey: AREA,
        projectKey: PROJ,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    },
    'e2e-task-c',
    'e2e-task-a',
  );
  const createdTask = [...d.tasks.tasks.values()].find((t) => t.title === 'Tarea E2E');
  assert.ok(createdTask);

  const statusKey = await createAndApprove(
    d,
    {
      name: 'Status',
      proposedActionType: 'task.change-status',
      targetType: 'task',
      targetKey: createdTask.key,
      reason: 'r',
      expectedChange: 'Pendiente → En progreso',
      risk: 'low',
      reversible: true,
      payload: { taskKey: createdTask.key, nextStatus: 'En progreso' },
    },
    'e2e-status-c',
    'e2e-status-a',
    'Pendiente',
  );
  assert.equal((await d.tasks.getTask(createdTask.key))?.status, 'En progreso');

  const statusRollback = await executeAction(
    request({
      actionType: 'action.rollback',
      idempotencyKey: 'e2e-status-r',
      payload: { proposalKey: statusKey },
      confirmation: rollbackConfirm,
    }),
    d,
  );
  assert.equal(statusRollback.ok, true);
  assert.equal((await d.tasks.getTask(createdTask.key))?.status, 'Pendiente');

  const createRollback = await executeAction(
    request({
      actionType: 'action.rollback',
      idempotencyKey: 'e2e-task-r',
      payload: { proposalKey: taskCreateKey },
      confirmation: rollbackConfirm,
    }),
    d,
  );
  assert.equal(createRollback.ok, true);
  assert.equal(await d.tasks.getTask(createdTask.key), null);

  const gymKey = await createAndApprove(
    d,
    {
      name: 'Gym',
      proposedActionType: 'gym.session.create',
      targetType: 'gym-session',
      targetKey: null,
      reason: 'r',
      expectedChange: 'c',
      risk: 'medium',
      reversible: true,
      payload: {
        date: '2026-07-28',
        routineKey: 'r1',
        workoutDayKey: 'd1',
        startedAt: null,
        finishedAt: null,
        durationMinutes: 30,
        energyBefore: 3,
        notes: null,
        sets: [
          {
            exerciseKey: 'ex1',
            exerciseName: 'Press',
            setIndex: 1,
            weight: 40,
            reps: 8,
            rir: 1,
            rpe: null,
            completed: true,
            notes: null,
          },
        ],
      },
    },
    'e2e-gym-c',
    'e2e-gym-a',
  );
  const gymRollback = await executeAction(
    request({
      actionType: 'action.rollback',
      idempotencyKey: 'e2e-gym-r',
      payload: { proposalKey: gymKey },
      confirmation: rollbackConfirm,
    }),
    d,
  );
  assert.equal(gymRollback.ok, true);
  assert.equal(
    [...d.gym.sessions.values()].every((s) => s.status === 'reverted'),
    true,
  );

  const start = '2030-01-01T15:00:00.000Z';
  const end = '2030-01-01T16:00:00.000Z';
  const calKey = await createAndApprove(
    d,
    {
      name: 'Cal',
      proposedActionType: 'calendar.hold.create',
      targetType: 'calendar-hold',
      targetKey: null,
      reason: 'r',
      expectedChange: 'c',
      risk: 'medium',
      reversible: true,
      payload: { title: 'Hold E2E', start, end, note: null, relatedTaskKey: null },
    },
    'e2e-cal-c',
    'e2e-cal-a',
  );
  const calRollback = await executeAction(
    request({
      actionType: 'action.rollback',
      idempotencyKey: 'e2e-cal-r',
      payload: { proposalKey: calKey },
      confirmation: rollbackConfirm,
    }),
    d,
  );
  assert.equal(calRollback.ok, true);

  const pending = (await d.proposals.list('pending')).length;
  const executing = (await d.proposals.list('executing')).length;
  const rolling = (await d.proposals.list('rolling-back')).length;
  assert.equal(pending, 0);
  assert.equal(executing, 0);
  assert.equal(rolling, 0);
  assert.equal(
    [...d.inbox.captures.values()].every((c) => c.archived),
    true,
  );
  assert.equal(
    [...d.calendar.holds.values()].every((h) => h.deleted),
    true,
  );
});

test('B3-OP-D. concurrent approve executes once; bad risk/target rejected without ciphertext', async () => {
  const encryptionStore = createMemoryEncryptedPayloadStore();
  const proposals = createMemoryProposalPort();
  const d = bundle({ encryptionStore, proposals });

  const badRisk = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'bad-risk',
      payload: {
        name: 'Bad risk',
        proposedActionType: 'inbox.capture',
        targetType: 'inbox',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'high',
        reversible: true,
        payload: {
          text: 'x',
          link: null,
          capturedAt: '2026-07-28T12:00:00.000Z',
          origin: 'web',
        },
      },
    }),
    d,
  );
  assert.equal(badRisk.ok, false);
  assert.equal(encryptionStore.size(), 0);

  const badTarget = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'bad-target',
      payload: {
        name: 'Bad target',
        proposedActionType: 'inbox.capture',
        targetType: 'system',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'low',
        reversible: true,
        payload: {
          text: 'x',
          link: null,
          capturedAt: '2026-07-28T12:00:00.000Z',
          origin: 'web',
        },
      },
    }),
    d,
  );
  assert.equal(badTarget.ok, false);
  assert.equal(encryptionStore.size(), 0);

  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'conc-c',
      payload: {
        name: 'Conc',
        proposedActionType: 'inbox.capture',
        targetType: 'inbox',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'low',
        reversible: true,
        payload: {
          text: 'concurrent',
          link: null,
          capturedAt: '2026-07-28T12:00:00.000Z',
          origin: 'web',
        },
      },
    }),
    d,
  );
  assert.equal(created.ok, true);
  const proposalKey = created.target?.key;
  assert.ok(proposalKey);

  const [a1, a2] = await Promise.all([
    executeAction(
      request({
        actionType: 'proposal.approve',
        idempotencyKey: 'conc-a1',
        payload: { proposalKey },
        confirmation: approveConfirm,
      }),
      d,
    ),
    executeAction(
      request({
        actionType: 'proposal.approve',
        idempotencyKey: 'conc-a2',
        payload: { proposalKey },
        confirmation: approveConfirm,
      }),
      d,
    ),
  ]);
  const successes = [a1, a2].filter((r) => r.ok);
  assert.equal(successes.length, 1);
  assert.equal(d.inbox.captures.size, 1);
});
