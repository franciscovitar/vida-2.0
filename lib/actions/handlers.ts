/**
 * Handlers de dominio (puertos inyectables). Sin I/O real por defecto.
 */
import {
  isValidTaskStatusTransition,
  validateCalendarBlockPropose,
  validateGymSessionCreate,
  validateInboxCapture,
  validateProposalCreate,
  validateProposalDecide,
  validateTaskChangeStatus,
  validateTaskCreate,
} from '@/lib/actions/payloads';
import type {
  GymSheetWritePort,
  NotionInboxWritePort,
  NotionTaskWritePort,
  ProposalRepositoryPort,
} from '@/lib/actions/ports';
import type { ActionResult, ActionTarget, AllowedActionType } from '@/types/actions';

function result(partial: ActionResult): ActionResult {
  return partial;
}

function opaque(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

export type HandlerDeps = {
  tasks: NotionTaskWritePort;
  inbox: NotionInboxWritePort;
  gym: GymSheetWritePort;
  proposals: ProposalRepositoryPort;
  now?: () => string;
};

export async function handleAllowedAction(input: {
  actionType: AllowedActionType;
  payload: unknown;
  expectedPrevious: string | null;
  idempotencyKey: string;
  deps: HandlerDeps;
}): Promise<ActionResult> {
  const now = input.deps.now?.() ?? new Date().toISOString();
  const { actionType, payload, idempotencyKey, deps, expectedPrevious } = input;

  if (actionType === 'task.create') {
    const parsed = validateTaskCreate(payload);
    if (!parsed.ok) {
      return result({
        ok: false,
        code: 'invalid-payload',
        message: parsed.message,
        idempotencyKey,
        actionType,
        target: null,
        summary: null,
        verified: null,
      });
    }
    const compat = await deps.tasks.resolveAreaProjectCompatibility(
      parsed.value.areaKey,
      parsed.value.projectKey,
    );
    if (!compat.ok) {
      return result({
        ok: false,
        code: 'invalid-payload',
        message: compat.message,
        idempotencyKey,
        actionType,
        target: { type: 'task', key: null },
        summary: null,
        verified: null,
      });
    }
    const created = await deps.tasks.createTask(parsed.value, { idempotencyKey });
    if (!created.ok) {
      return result({
        ok: false,
        code: 'failed',
        message: created.message,
        idempotencyKey,
        actionType,
        target: null,
        summary: null,
        verified: false,
      });
    }
    const verified = await deps.tasks.getTask(created.key);
    const ok = Boolean(verified && verified.title === parsed.value.title);
    return result({
      ok,
      code: ok ? 'applied' : 'verification-failed',
      message: ok ? 'Tarea creada.' : 'La verificación posterior falló.',
      idempotencyKey,
      actionType,
      target: { type: 'task', key: created.key },
      summary: ok ? `Tarea «${parsed.value.title}»` : null,
      verified: ok,
    });
  }

  if (actionType === 'task.change-status') {
    const parsed = validateTaskChangeStatus(payload);
    if (!parsed.ok) {
      return result({
        ok: false,
        code: 'invalid-payload',
        message: parsed.message,
        idempotencyKey,
        actionType,
        target: null,
        summary: null,
        verified: null,
      });
    }
    const before = await deps.tasks.getTask(parsed.value.taskKey);
    if (!before) {
      return result({
        ok: false,
        code: 'failed',
        message: 'Tarea no encontrada.',
        idempotencyKey,
        actionType,
        target: { type: 'task', key: parsed.value.taskKey },
        summary: null,
        verified: false,
      });
    }
    const expected = expectedPrevious ?? before.status;
    if (before.status !== expected) {
      return result({
        ok: false,
        code: 'conflict',
        message: 'Conflicto: el estado previo no coincide.',
        idempotencyKey,
        actionType,
        target: { type: 'task', key: before.key },
        summary: null,
        verified: false,
      });
    }
    if (!isValidTaskStatusTransition(before.status, parsed.value.nextStatus)) {
      return result({
        ok: false,
        code: 'invalid-payload',
        message: 'Transición de estado inválida.',
        idempotencyKey,
        actionType,
        target: { type: 'task', key: before.key },
        summary: null,
        verified: null,
      });
    }
    const updated = await deps.tasks.updateTaskStatus(
      before.key,
      parsed.value.nextStatus,
      expected,
    );
    if (!updated.ok) {
      return result({
        ok: false,
        code: updated.code === 'conflict' ? 'conflict' : 'failed',
        message: updated.message,
        idempotencyKey,
        actionType,
        target: { type: 'task', key: before.key },
        summary: null,
        verified: false,
      });
    }
    const after = await deps.tasks.getTask(before.key);
    const ok = after?.status === parsed.value.nextStatus;
    return result({
      ok,
      code: ok ? 'applied' : 'verification-failed',
      message: ok ? 'Estado actualizado.' : 'Verificación posterior falló.',
      idempotencyKey,
      actionType,
      target: { type: 'task', key: before.key },
      summary: ok ? `${before.status} → ${parsed.value.nextStatus}` : null,
      verified: ok,
    });
  }

  if (actionType === 'inbox.capture') {
    const parsed = validateInboxCapture(payload);
    if (!parsed.ok) {
      return result({
        ok: false,
        code: 'invalid-payload',
        message: parsed.message,
        idempotencyKey,
        actionType,
        target: null,
        summary: null,
        verified: null,
      });
    }
    const written = await deps.inbox.appendCapture(parsed.value, { idempotencyKey });
    if (!written.ok) {
      return result({
        ok: false,
        code: 'not-configured',
        message: `${written.message} Texto preservado en el formulario.`,
        idempotencyKey,
        actionType,
        target: { type: 'inbox', key: null },
        summary: parsed.value.text.slice(0, 80),
        verified: false,
      });
    }
    return result({
      ok: true,
      code: 'applied',
      message: 'Captura guardada en Bandeja.',
      idempotencyKey,
      actionType,
      target: { type: 'inbox', key: written.key },
      summary: parsed.value.text.slice(0, 80),
      verified: true,
    });
  }

  if (actionType === 'gym.session.create') {
    const parsed = validateGymSessionCreate(payload);
    if (!parsed.ok) {
      return result({
        ok: false,
        code: 'invalid-payload',
        message: parsed.message,
        idempotencyKey,
        actionType,
        target: null,
        summary: null,
        verified: null,
      });
    }
    const sessionId = opaque('gym', idempotencyKey);
    const pending = await deps.gym.createPendingSession(parsed.value, {
      sessionId,
      idempotencyKey,
      createdAt: now,
    });
    if (!pending.ok) {
      return result({
        ok: false,
        code: 'failed',
        message: pending.message,
        idempotencyKey,
        actionType,
        target: { type: 'gym-session', key: sessionId },
        summary: null,
        verified: false,
      });
    }
    const setsWrite = await deps.gym.writeSets(sessionId, parsed.value.sets);
    if (!setsWrite.ok) {
      await deps.gym.setSessionStatus(sessionId, 'partial');
      return result({
        ok: false,
        code: 'partial',
        message: `Sesión parcial: ${setsWrite.message}`,
        idempotencyKey,
        actionType,
        target: { type: 'gym-session', key: sessionId },
        summary: `sets=${setsWrite.written}`,
        verified: false,
      });
    }
    const verified = await deps.gym.verifySession(sessionId, parsed.value.sets.length);
    if (!verified.ok) {
      await deps.gym.setSessionStatus(sessionId, 'failed');
      return result({
        ok: false,
        code: 'verification-failed',
        message: verified.message,
        idempotencyKey,
        actionType,
        target: { type: 'gym-session', key: sessionId },
        summary: null,
        verified: false,
      });
    }
    await deps.gym.setSessionStatus(sessionId, 'complete');
    return result({
      ok: true,
      code: 'applied',
      message: 'Sesión de gimnasio registrada.',
      idempotencyKey,
      actionType,
      target: { type: 'gym-session', key: sessionId },
      summary: `${parsed.value.sets.length} sets`,
      verified: true,
    });
  }

  if (actionType === 'proposal.create') {
    // Calendar block propose arrives as proposal.create with calendar payload embedded,
    // or dedicated calendar helper maps into proposal.create.
    const asCalendar = validateCalendarBlockPropose(payload);
    if (asCalendar.ok) {
      const key = opaque('prop', idempotencyKey);
      const created = await deps.proposals.create(
        {
          name: `Calendar: ${asCalendar.value.title}`,
          proposedActionType: 'calendar.block.propose',
          targetType: 'calendar-block',
          targetKey: null,
          reason: asCalendar.value.reason,
          expectedChange: `${asCalendar.value.date} ${asCalendar.value.startTime}-${asCalendar.value.endTime}`,
          risk: 'medium',
          reversible: true,
          sanitizedPayload: {
            title: asCalendar.value.title,
            date: asCalendar.value.date,
            startTime: asCalendar.value.startTime,
            endTime: asCalendar.value.endTime,
            relatedTaskKey: asCalendar.value.relatedTaskKey,
          },
        },
        { key, idempotencyKey, createdAt: now },
      );
      return result({
        ok: true,
        code: 'applied',
        message: 'Propuesta de bloque Calendar creada (sin evento real).',
        idempotencyKey,
        actionType,
        target: { type: 'proposal', key: created.key },
        summary: created.name,
        verified: true,
      });
    }

    const parsed = validateProposalCreate(payload);
    if (!parsed.ok) {
      return result({
        ok: false,
        code: 'invalid-payload',
        message: parsed.message,
        idempotencyKey,
        actionType,
        target: null,
        summary: null,
        verified: null,
      });
    }
    const key = opaque('prop', idempotencyKey);
    const created = await deps.proposals.create(parsed.value, {
      key,
      idempotencyKey,
      createdAt: now,
    });
    return result({
      ok: true,
      code: 'applied',
      message: 'Propuesta creada.',
      idempotencyKey,
      actionType,
      target: { type: 'proposal', key: created.key },
      summary: created.name,
      verified: true,
    });
  }

  if (actionType === 'proposal.approve' || actionType === 'proposal.reject') {
    const parsed = validateProposalDecide(payload);
    if (!parsed.ok) {
      return result({
        ok: false,
        code: 'invalid-payload',
        message: parsed.message,
        idempotencyKey,
        actionType,
        target: null,
        summary: null,
        verified: null,
      });
    }
    const existing = await deps.proposals.get(parsed.value.proposalKey);
    if (!existing) {
      return result({
        ok: false,
        code: 'failed',
        message: 'Propuesta no encontrada.',
        idempotencyKey,
        actionType,
        target: { type: 'proposal', key: parsed.value.proposalKey },
        summary: null,
        verified: false,
      });
    }
    if (existing.status !== 'pending') {
      return result({
        ok: false,
        code: 'conflict',
        message: 'La propuesta ya fue decidida.',
        idempotencyKey,
        actionType,
        target: { type: 'proposal', key: existing.key },
        summary: null,
        verified: false,
      });
    }
    // Aprobar nunca crea eventos Calendar reales.
    if (actionType === 'proposal.approve' && existing.actionType === 'calendar.block.propose') {
      const updated = await deps.proposals.updateStatus(existing.key, 'approved', {
        decidedAt: now,
        resultCode: 'approved-no-calendar-write',
        afterSummary: 'Aprobada; creación real de evento pendiente de scope futuro.',
      });
      return result({
        ok: true,
        code: 'applied',
        message: 'Propuesta Calendar aprobada sin crear evento.',
        idempotencyKey,
        actionType,
        target: { type: 'proposal', key: existing.key },
        summary: updated?.afterSummary ?? null,
        verified: true,
      });
    }
    const status = actionType === 'proposal.approve' ? 'approved' : 'rejected';
    const updated = await deps.proposals.updateStatus(existing.key, status, {
      decidedAt: now,
      resultCode: status,
      afterSummary: status === 'approved' ? 'Aprobada' : 'Rechazada',
    });
    return result({
      ok: true,
      code: 'applied',
      message: status === 'approved' ? 'Propuesta aprobada.' : 'Propuesta rechazada.',
      idempotencyKey,
      actionType,
      target: { type: 'proposal', key: existing.key },
      summary: updated?.afterSummary ?? null,
      verified: true,
    });
  }

  return result({
    ok: false,
    code: 'failed',
    message: 'Handler no implementado.',
    idempotencyKey,
    actionType,
    target: null as ActionTarget | null,
    summary: null,
    verified: null,
  });
}
