/**
 * Tests 8E.1 — Policy Engine, escrituras seguras y aprobaciones (fixtures).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { auditLooksSafe, createMemoryAuditSink, sanitizeActorHint } from '@/lib/actions/audit';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { executeAction } from '@/lib/actions/engine';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import {
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import {
  evaluateActionPolicy,
  isForbiddenActionType,
  listForbiddenActionTypes,
} from '@/lib/actions/policy';
import { portHasDestructiveMethods } from '@/lib/actions/ports';
import { primaryNav } from '@/lib/constants/navigation';
import type { ActionConfirmation, ActionRequest } from '@/types/actions';

const explicit: ActionConfirmation = {
  mode: 'explicit',
  acknowledged: true,
  phrase: null,
};

function deps(overrides?: {
  tasks?: ReturnType<typeof createMemoryTaskPort>;
  inbox?: ReturnType<typeof createMemoryInboxPort>;
  gym?: ReturnType<typeof createMemoryGymPort>;
  proposals?: ReturnType<typeof createMemoryProposalPort>;
}) {
  return {
    writesEnabled: true,
    idempotency: createMemoryIdempotencyStore(),
    audit: createMemoryAuditSink(),
    handlers: {
      tasks:
        overrides?.tasks ??
        createMemoryTaskPort({
          areaProjectMap: { 'proj-salud': 'area.salud', 'proj-facu': 'area.facultad' },
        }),
      inbox: overrides?.inbox ?? createMemoryInboxPort(),
      gym: overrides?.gym ?? createMemoryGymPort(),
      proposals: overrides?.proposals ?? createMemoryProposalPort(),
      now: () => '2026-07-22T12:00:00.000Z',
    },
  };
}

function request(
  partial: Partial<ActionRequest> &
    Pick<ActionRequest, 'actionType' | 'payload' | 'idempotencyKey'>,
): ActionRequest {
  return {
    actorEmail: 'user@example.com',
    confirmation: explicit,
    expectedPrevious: null,
    context: { source: 'web', targetDate: '2026-07-22' },
    ...partial,
  };
}

test('8E1-1. flag apagada bloquea toda escritura', async () => {
  assert.equal(isWriteActionsEnabled({}), false);
  assert.equal(isWriteActionsEnabled({ WRITE_ACTIONS_ENABLED: 'true' }), true);
  assert.equal(isWriteActionsEnabled({ WRITE_ACTIONS_ENABLED: 'TRUE' }), false);
  const result = await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'k1',
      payload: {
        title: 'Tarea demo',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    { ...deps(), writesEnabled: false },
  );
  assert.equal(result.code, 'flag-disabled');
  assert.equal(result.ok, false);
});

test('8E1-2. usuario no autenticado', async () => {
  const result = await executeAction(
    request({
      actionType: 'inbox.capture',
      actorEmail: '',
      idempotencyKey: 'k2',
      payload: { text: 'hola', link: null, capturedAt: '2026-07-22', origin: 'web' },
    }),
    deps(),
  );
  assert.equal(result.code, 'unauthorized');
});

test('8E1-3. acción no registrada', () => {
  const decision = evaluateActionPolicy({
    actionType: 'task.explode',
    writesEnabled: true,
    authenticated: true,
    confirmation: explicit,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'unknown-action');
});

test('8E1-4. acción prohibida', async () => {
  assert.equal(isForbiddenActionType('content.delete'), true);
  assert.ok(listForbiddenActionTypes().includes('journaling.write'));
  const result = await executeAction(
    {
      ...request({
        actionType: 'task.create',
        idempotencyKey: 'forbid',
        payload: {},
      }),
      actionType: 'content.delete' as never,
    },
    deps(),
  );
  assert.equal(result.ok, false);
  assert.equal(result.actionType, 'forbidden');
});

test('8E1-5. confirmación ausente', () => {
  const decision = evaluateActionPolicy({
    actionType: 'task.create',
    writesEnabled: true,
    authenticated: true,
    confirmation: null,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'confirmation-missing');
});

test('8E1-6. confirmación insuficiente', () => {
  const decision = evaluateActionPolicy({
    actionType: 'proposal.approve',
    writesEnabled: true,
    authenticated: true,
    confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'confirmation-insufficient');
});

test('8E1-7. idempotencia', async () => {
  const d = deps();
  const payload = {
    title: 'Idempotente',
    priority: 'Alta' as const,
    areaKey: 'area.salud',
    projectKey: null,
    date: null,
    duration: null,
    energy: null,
    note: null,
  };
  const first = await executeAction(
    request({ actionType: 'task.create', idempotencyKey: 'same-key', payload }),
    d,
  );
  const second = await executeAction(
    request({ actionType: 'task.create', idempotencyKey: 'same-key', payload }),
    d,
  );
  assert.equal(first.ok, true);
  assert.equal(second.code, 'idempotent-replay');
});

test('8E1-8. conflicto por estado previo', async () => {
  const tasks = createMemoryTaskPort();
  await tasks.createTask(
    {
      title: 'Conflicto',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'c0' },
  );
  const key = [...tasks.tasks.keys()][0]!;
  const result = await executeAction(
    request({
      actionType: 'task.change-status',
      idempotencyKey: 'c1',
      expectedPrevious: 'Hecha',
      payload: { taskKey: key, nextStatus: 'En progreso' },
    }),
    deps({ tasks }),
  );
  assert.equal(result.code, 'conflict');
});

test('8E1-9. creación de tarea válida', async () => {
  const result = await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'create-ok',
      payload: {
        title: 'Preparar informe',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: '30 min',
        energy: 'Baja',
        note: null,
      },
    }),
    deps(),
  );
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(JSON.stringify(result).includes('notion.so'), false);
});

test('8E1-10. tarea con Área incompatible', async () => {
  const result = await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'bad-area',
      payload: {
        title: 'Cruzada',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: 'proj-facu',
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    deps(),
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /incompatible/i);
});

test('8E1-11. transición de estado válida', async () => {
  const tasks = createMemoryTaskPort();
  const created = await tasks.createTask(
    {
      title: 'Mover',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'm0' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const result = await executeAction(
    request({
      actionType: 'task.change-status',
      idempotencyKey: 'm1',
      expectedPrevious: 'Pendiente',
      payload: { taskKey: created.key, nextStatus: 'En progreso' },
    }),
    deps({ tasks }),
  );
  assert.equal(result.ok, true);
});

test('8E1-12. transición inválida', async () => {
  const tasks = createMemoryTaskPort();
  const created = await tasks.createTask(
    {
      title: 'Hecha ya',
      priority: 'Media',
      areaKey: 'area.salud',
      projectKey: null,
      date: null,
      duration: null,
      energy: null,
      note: null,
    },
    { idempotencyKey: 'inv0' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await tasks.updateTaskStatus(created.key, 'Hecha', 'Pendiente');
  const result = await executeAction(
    request({
      actionType: 'task.change-status',
      idempotencyKey: 'inv1',
      expectedPrevious: 'Hecha',
      payload: { taskKey: created.key, nextStatus: 'Bloqueada' },
    }),
    deps({ tasks }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-payload');
});

test('8E1-13. verificación posterior de Notion', async () => {
  const tasks = createMemoryTaskPort();
  const originalGet = tasks.getTask.bind(tasks);
  tasks.getTask = async (key) => {
    const row = await originalGet(key);
    if (row) return { ...row, title: 'distinto' };
    return row;
  };
  const result = await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'verify-fail',
      payload: {
        title: 'Verificar',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    deps({ tasks }),
  );
  assert.equal(result.code, 'verification-failed');
});

test('8E1-14. captura de Bandeja', async () => {
  const inbox = createMemoryInboxPort();
  const result = await executeAction(
    request({
      actionType: 'inbox.capture',
      idempotencyKey: 'inbox-ok',
      payload: {
        text: 'Idea rápida',
        link: 'https://example.com',
        capturedAt: '2026-07-22T12:00:00.000Z',
        origin: 'web',
      },
    }),
    deps({ inbox }),
  );
  assert.equal(result.ok, true);
  assert.equal(inbox.captures.length, 1);
});

test('8E1-15. captura preservada ante error', async () => {
  const inbox = createMemoryInboxPort({ fail: true });
  const result = await executeAction(
    request({
      actionType: 'inbox.capture',
      idempotencyKey: 'inbox-fail',
      payload: {
        text: 'No perder esto',
        link: null,
        capturedAt: '2026-07-22T12:00:00.000Z',
        origin: 'web',
      },
    }),
    deps({ inbox }),
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /preservado/i);
  assert.equal(result.summary, 'No perder esto');
});

test('8E1-16. sesión de gimnasio completa', async () => {
  const gym = createMemoryGymPort();
  const result = await executeAction(
    request({
      actionType: 'gym.session.create',
      idempotencyKey: 'gym-ok',
      payload: {
        date: '2026-07-22',
        routineKey: 'rutina',
        workoutDayKey: 'day-a',
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
            rpe: 8,
            completed: true,
            notes: null,
          },
        ],
      },
    }),
    deps({ gym }),
  );
  assert.equal(result.ok, true);
  const session = [...gym.sessions.values()][0]!;
  assert.equal(session.status, 'complete');
});

test('8E1-17. fallo parcial de sets', async () => {
  const gym = createMemoryGymPort({ failSetsAfter: 1 });
  const result = await executeAction(
    request({
      actionType: 'gym.session.create',
      idempotencyKey: 'gym-partial',
      payload: {
        date: '2026-07-22',
        routineKey: 'rutina',
        workoutDayKey: 'day-a',
        startedAt: null,
        finishedAt: null,
        durationMinutes: null,
        energyBefore: null,
        notes: null,
        sets: [
          {
            exerciseKey: 'ex1',
            exerciseName: 'Press',
            setIndex: 1,
            weight: 40,
            reps: 8,
            rir: null,
            rpe: null,
            completed: true,
            notes: null,
          },
          {
            exerciseKey: 'ex1',
            exerciseName: 'Press',
            setIndex: 2,
            weight: 40,
            reps: 8,
            rir: null,
            rpe: null,
            completed: true,
            notes: null,
          },
        ],
      },
    }),
    deps({ gym }),
  );
  assert.equal(result.code, 'partial');
  assert.equal([...gym.sessions.values()][0]!.status, 'partial');
});

test('8E1-18. sesión marcada failed', async () => {
  const gym = createMemoryGymPort({ failVerify: true });
  const result = await executeAction(
    request({
      actionType: 'gym.session.create',
      idempotencyKey: 'gym-fail',
      payload: {
        date: '2026-07-22',
        routineKey: 'rutina',
        workoutDayKey: 'day-a',
        startedAt: null,
        finishedAt: null,
        durationMinutes: null,
        energyBefore: null,
        notes: null,
        sets: [
          {
            exerciseKey: 'ex1',
            exerciseName: 'Press',
            setIndex: 1,
            weight: 40,
            reps: 8,
            rir: 1,
            rpe: 7,
            completed: true,
            notes: null,
          },
        ],
      },
    }),
    deps({ gym }),
  );
  assert.equal(result.code, 'verification-failed');
  assert.equal([...gym.sessions.values()][0]!.status, 'failed');
});

test('8E1-19. validación de peso, reps, RIR y RPE', async () => {
  const result = await executeAction(
    request({
      actionType: 'gym.session.create',
      idempotencyKey: 'gym-bad',
      payload: {
        date: '2026-07-22',
        routineKey: 'rutina',
        workoutDayKey: 'day-a',
        startedAt: null,
        finishedAt: null,
        durationMinutes: null,
        energyBefore: null,
        notes: null,
        sets: [
          {
            exerciseKey: 'ex1',
            exerciseName: 'Press',
            setIndex: 1,
            weight: -1,
            reps: 8,
            rir: 2,
            rpe: 8,
            completed: true,
            notes: null,
          },
        ],
      },
    }),
    deps(),
  );
  assert.equal(result.code, 'invalid-payload');
});

test('8E1-20. propuesta creada', async () => {
  const proposals = createMemoryProposalPort();
  const result = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'prop-1',
      payload: {
        name: 'Mover tarea',
        proposedActionType: 'task.change-status',
        targetType: 'task',
        targetKey: 'task-1',
        reason: 'Reorganizar',
        expectedChange: 'Pendiente → En progreso',
        risk: 'low',
        reversible: true,
        sanitizedPayload: { nextStatus: 'En progreso' },
      },
    }),
    deps({ proposals }),
  );
  assert.equal(result.ok, true);
  assert.equal((await proposals.list()).length, 1);
});

test('8E1-21. propuesta aprobada', async () => {
  const proposals = createMemoryProposalPort();
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'prop-2',
      payload: {
        name: 'Propuesta X',
        proposedActionType: 'inbox.capture',
        targetType: 'inbox',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'low',
        reversible: true,
        sanitizedPayload: {},
      },
    }),
    deps({ proposals }),
  );
  assert.equal(created.ok, true);
  const key = created.target?.key;
  assert.ok(key);
  const approved = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: 'prop-2-a',
      confirmation: { mode: 'reinforced', acknowledged: true, phrase: 'aprobar' },
      payload: { proposalKey: key },
    }),
    deps({ proposals }),
  );
  assert.equal(approved.ok, true);
  assert.equal((await proposals.get(key!))?.status, 'approved');
});

test('8E1-22. propuesta rechazada', async () => {
  const proposals = createMemoryProposalPort();
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'prop-3',
      payload: {
        name: 'Propuesta Y',
        proposedActionType: 'inbox.capture',
        targetType: 'inbox',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'low',
        reversible: true,
        sanitizedPayload: {},
      },
    }),
    deps({ proposals }),
  );
  assert.equal(created.ok, true);
  const key = created.target?.key;
  assert.ok(key);
  const rejected = await executeAction(
    request({
      actionType: 'proposal.reject',
      idempotencyKey: 'prop-3-r',
      payload: { proposalKey: key },
    }),
    deps({ proposals }),
  );
  assert.equal(rejected.ok, true);
  assert.equal((await proposals.get(key!))?.status, 'rejected');
});

test('8E1-23. aprobación vuelve a pasar por política', async () => {
  const decision = evaluateActionPolicy({
    actionType: 'proposal.approve',
    writesEnabled: true,
    authenticated: true,
    confirmation: { mode: 'reinforced', acknowledged: true, phrase: 'no' },
  });
  assert.equal(decision.ok, false);
});

test('8E1-24. propuesta Calendar no crea evento', async () => {
  const proposals = createMemoryProposalPort();
  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'cal-1',
      payload: {
        title: 'Bloque foco',
        date: '2026-07-23',
        startTime: '10:00',
        endTime: '11:00',
        reason: 'Proteger tiempo',
        relatedTaskKey: null,
      },
    }),
    deps({ proposals }),
  );
  assert.equal(created.ok, true);
  const key = created.target?.key;
  assert.ok(key);
  const approved = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: 'cal-1-a',
      confirmation: { mode: 'reinforced', acknowledged: true, phrase: 'aprobar' },
      payload: { proposalKey: key },
    }),
    deps({ proposals }),
  );
  assert.equal(approved.ok, true);
  assert.match(approved.message, /sin crear evento/i);
  assert.equal((await proposals.get(key))?.resultCode, 'approved-no-calendar-write');
});

test('8E1-25. Journaling prohibido', () => {
  assert.equal(isForbiddenActionType('journaling.read'), true);
  assert.equal(isForbiddenActionType('journaling.write'), true);
});

test('8E1-26. eliminación/archivo/fusión prohibidos', () => {
  assert.equal(isForbiddenActionType('content.delete'), true);
  assert.equal(isForbiddenActionType('content.archive'), true);
  assert.equal(isForbiddenActionType('content.merge'), true);
});

test('8E1-27. auditoría sin secretos', async () => {
  const audit = createMemoryAuditSink();
  await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'aud-1',
      payload: {
        title: 'Auditar',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    { ...deps(), audit },
  );
  const row = audit.list()[0]!;
  assert.equal(auditLooksSafe(row), true);
  assert.equal(sanitizeActorHint('user@example.com').includes('user@'), false);
  assert.match(sanitizeActorHint('user@example.com'), /^us\*\*\*@example\.com$/);
});

test('8E1-28. DTOs sin IDs o URLs internas', async () => {
  const result = await executeAction(
    request({
      actionType: 'task.create',
      idempotencyKey: 'dto-1',
      payload: {
        title: 'DTO limpio',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    }),
    deps(),
  );
  const json = JSON.stringify(result);
  assert.equal(json.includes('https://'), false);
  assert.equal(json.includes('secret_'), false);
  assert.equal(json.includes('notion.so'), false);
});

test('8E1-29. ausencia de métodos destructivos', () => {
  const tasks = createMemoryTaskPort();
  assert.equal(portHasDestructiveMethods(tasks), false);
  const source = readFileSync(path.join(process.cwd(), 'lib/actions/ports.ts'), 'utf8');
  assert.equal(/deleteTask|archivePage|mergePages|createCalendarEvent/.test(source), false);
  assert.ok(primaryNav.some((item) => item.href === '/aprobaciones'));
});

test('8E1-30. calendar.event.create no es acción permitida', () => {
  const decision = evaluateActionPolicy({
    actionType: 'calendar.event.create',
    writesEnabled: true,
    authenticated: true,
    confirmation: explicit,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, 'forbidden-action');
});
