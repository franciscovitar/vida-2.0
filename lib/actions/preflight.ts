/**
 * Read-before-proposal: valida referencias y proveedores antes de cifrar/persistir.
 */
import {
  buildCalendarHoldDiff,
  buildGymSessionDiff,
  buildInboxCaptureDiff,
  buildTaskChangeStatusDiff,
  buildTaskCreateDiff,
  digestFromDiff,
} from '@/lib/actions/diff';
import type { HandlerDeps } from '@/lib/actions/handlers';
import {
  isValidTaskStatusTransition,
  validateCalendarHoldCreate,
  validateGymSessionCreate,
  validateInboxCapture,
  validateTaskChangeStatus,
  validateTaskCreate,
} from '@/lib/actions/payloads';
import type { ActionDiff, ProposedBusinessActionType } from '@/types/actions';

export type PreflightResult =
  | {
      ok: true;
      beforeDigest: string | null;
      diff: ActionDiff | null;
      currentStatus?: string;
    }
  | {
      ok: false;
      code: 'invalid-payload' | 'not-configured' | 'conflict';
      message: string;
    };

export async function preflightBusinessProposal(
  actionType: ProposedBusinessActionType,
  payload: unknown,
  deps: Pick<HandlerDeps, 'tasks' | 'inbox' | 'gym' | 'calendar'>,
): Promise<PreflightResult> {
  if (actionType === 'task.create') {
    const parsed = validateTaskCreate(payload);
    if (!parsed.ok) {
      return { ok: false, code: 'invalid-payload', message: parsed.message };
    }
    const compat = await deps.tasks.resolveAreaProjectCompatibility(
      parsed.value.areaKey,
      parsed.value.projectKey,
    );
    if (!compat.ok) {
      return { ok: false, code: 'invalid-payload', message: compat.message };
    }
    const diff = buildTaskCreateDiff(parsed.value);
    return { ok: true, beforeDigest: digestFromDiff({ fields: [] }), diff };
  }

  if (actionType === 'task.change-status') {
    const parsed = validateTaskChangeStatus(payload);
    if (!parsed.ok) {
      return { ok: false, code: 'invalid-payload', message: parsed.message };
    }
    const before = await deps.tasks.getTask(parsed.value.taskKey);
    if (!before) {
      return { ok: false, code: 'invalid-payload', message: 'Tarea no encontrada.' };
    }
    if (!isValidTaskStatusTransition(before.status, parsed.value.nextStatus)) {
      return {
        ok: false,
        code: 'invalid-payload',
        message: 'Transición de estado no permitida.',
      };
    }
    if (before.status === parsed.value.nextStatus) {
      return {
        ok: false,
        code: 'invalid-payload',
        message: 'El nuevo estado debe ser distinto al actual.',
      };
    }
    const diff = buildTaskChangeStatusDiff(before.status, parsed.value);
    return {
      ok: true,
      beforeDigest: `status:${before.status}`,
      diff,
      currentStatus: before.status,
    };
  }

  if (actionType === 'inbox.capture') {
    const parsed = validateInboxCapture(payload);
    if (!parsed.ok) {
      return { ok: false, code: 'invalid-payload', message: parsed.message };
    }
    const ready = await deps.inbox.checkReady();
    if (!ready.ok) {
      return {
        ok: false,
        code: ready.code === 'not-configured' ? 'not-configured' : 'not-configured',
        message: ready.message,
      };
    }
    return {
      ok: true,
      beforeDigest: digestFromDiff({ fields: [] }),
      diff: buildInboxCaptureDiff(parsed.value),
    };
  }

  if (actionType === 'gym.session.create') {
    const parsed = validateGymSessionCreate(payload);
    if (!parsed.ok) {
      return { ok: false, code: 'invalid-payload', message: parsed.message };
    }
    const ready = await deps.gym.checkReady();
    if (!ready.ok) {
      return {
        ok: false,
        code: ready.code === 'misconfigured' ? 'not-configured' : 'not-configured',
        message: ready.message,
      };
    }
    return {
      ok: true,
      beforeDigest: digestFromDiff({ fields: [] }),
      diff: buildGymSessionDiff(parsed.value),
    };
  }

  const parsed = validateCalendarHoldCreate(payload);
  if (!parsed.ok) {
    return { ok: false, code: 'invalid-payload', message: parsed.message };
  }
  if (!deps.calendar) {
    return {
      ok: false,
      code: 'not-configured',
      message: 'Calendario dedicado no configurado.',
    };
  }
  const ready = await deps.calendar.checkReady();
  if (!ready.ok) {
    return {
      ok: false,
      code: ready.code === 'not-configured' ? 'not-configured' : 'not-configured',
      message: ready.message,
    };
  }
  return {
    ok: true,
    beforeDigest: digestFromDiff({ fields: [] }),
    diff: buildCalendarHoldDiff(parsed.value),
  };
}
