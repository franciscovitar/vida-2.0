/**
 * Handlers de dominio (puertos inyectables) + orquestación de propuestas/rollback.
 */
import { createHash } from 'node:crypto';
import {
  buildCalendarHoldDiff,
  buildGymSessionDiff,
  buildInboxCaptureDiff,
  buildTaskChangeStatusDiff,
  buildTaskCreateDiff,
  digestFromDiff,
} from '@/lib/actions/diff';
import {
  decryptProposalPayload,
  encryptProposalPayload,
  encryptedPayloadStorageKey,
  payloadDigest,
  type EncryptedPayloadStore,
} from '@/lib/actions/encryption';
import type { WriteCoordinationPort } from '@/lib/actions/coordination';
import {
  isValidTaskStatusTransition,
  validateActionRollback,
  validateCalendarHoldCreate,
  validateGymSessionCreate,
  validateInboxCapture,
  validateProposalCreate,
  validateProposalDecide,
  validateTaskChangeStatus,
  validateTaskCreate,
} from '@/lib/actions/payloads';
import type {
  CalendarHoldWritePort,
  GymSheetWritePort,
  NotionInboxWritePort,
  NotionTaskWritePort,
  OwnershipProof,
  ProposalRepositoryPort,
} from '@/lib/actions/ports';
import { isBusinessActionType } from '@/lib/actions/policy';
import { preflightBusinessProposal } from '@/lib/actions/preflight';
import {
  WRITE_CONTRACT_VERSION,
  type ActionDiff,
  type ActionProposalSummary,
  type ActionResult,
  type ActionTarget,
  type AllowedActionType,
  type ProposalStatus,
  type ProposedBusinessActionType,
  type TaskChangeStatusPayload,
} from '@/types/actions';

function result(partial: ActionResult): ActionResult {
  return partial;
}

function opaque(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

function ownershipFrom(seed: string): OwnershipProof {
  return createHash('sha256').update(`own:${seed}`).digest('hex').slice(0, 24);
}

export type BusinessWriteOutcome = {
  result: ActionResult;
  beforeDigest: string | null;
  afterDigest: string | null;
  diff: ActionDiff | null;
  ownership: OwnershipProof | null;
  reversible: boolean;
};

export type HandlerDeps = {
  tasks: NotionTaskWritePort;
  inbox: NotionInboxWritePort;
  gym: GymSheetWritePort;
  proposals: ProposalRepositoryPort;
  calendar?: CalendarHoldWritePort;
  encryptionStore?: EncryptedPayloadStore;
  encryptionKey?: Buffer | null;
  coordination?: WriteCoordinationPort;
  approvalTtlSeconds?: number;
  rollbackWindowSeconds?: number;
  contractVersion?: string;
  source?: string;
  now?: () => string;
};

async function casUpdateStatus(
  deps: HandlerDeps,
  key: string,
  status: ProposalStatus,
  patch: Parameters<ProposalRepositoryPort['updateStatus']>[2],
  expectedStatus: ProposalStatus,
): Promise<ActionProposalSummary | null> {
  return deps.proposals.updateStatus(key, status, patch, { expectedStatus });
}

function fail(
  actionType: AllowedActionType,
  idempotencyKey: string,
  code: ActionResult['code'],
  message: string,
  target: ActionTarget | null = null,
): ActionResult {
  return result({
    ok: false,
    code,
    message,
    idempotencyKey,
    actionType,
    target,
    summary: null,
    verified: code === 'invalid-payload' ? null : false,
  });
}

async function executeBusinessAction(input: {
  actionType: ProposedBusinessActionType;
  payload: unknown;
  expectedPrevious: string | null;
  idempotencyKey: string;
  deps: HandlerDeps;
}): Promise<BusinessWriteOutcome> {
  const now = input.deps.now?.() ?? new Date().toISOString();
  const { actionType, payload, idempotencyKey, deps, expectedPrevious } = input;

  if (actionType === 'task.create') {
    const parsed = validateTaskCreate(payload);
    if (!parsed.ok) {
      return {
        result: fail(actionType, idempotencyKey, 'invalid-payload', parsed.message),
        beforeDigest: null,
        afterDigest: null,
        diff: null,
        ownership: null,
        reversible: true,
      };
    }
    const diff = buildTaskCreateDiff(parsed.value);
    const beforeDigest = digestFromDiff({ fields: [] });
    const compat = await deps.tasks.resolveAreaProjectCompatibility(
      parsed.value.areaKey,
      parsed.value.projectKey,
    );
    if (!compat.ok) {
      return {
        result: fail(actionType, idempotencyKey, 'invalid-payload', compat.message, {
          type: 'task',
          key: null,
        }),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: null,
        reversible: true,
      };
    }
    const created = await deps.tasks.createTask(parsed.value, { idempotencyKey });
    if (!created.ok) {
      return {
        result: fail(actionType, idempotencyKey, 'failed', created.message),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: null,
        reversible: true,
      };
    }
    const verified = await deps.tasks.getTask(created.key);
    const ok = Boolean(verified && verified.title === parsed.value.title);
    return {
      result: result({
        ok,
        code: ok ? 'applied' : 'verification-failed',
        message: ok ? 'Tarea creada.' : 'La verificación posterior falló.',
        idempotencyKey,
        actionType,
        target: { type: 'task', key: created.key },
        summary: ok ? `Tarea «${parsed.value.title}»` : null,
        verified: ok,
      }),
      beforeDigest,
      afterDigest: digestFromDiff(diff),
      diff,
      ownership: created.ownership,
      reversible: true,
    };
  }

  if (actionType === 'task.change-status') {
    const parsed = validateTaskChangeStatus(payload);
    if (!parsed.ok) {
      return {
        result: fail(actionType, idempotencyKey, 'invalid-payload', parsed.message),
        beforeDigest: null,
        afterDigest: null,
        diff: null,
        ownership: null,
        reversible: true,
      };
    }
    const before = await deps.tasks.getTask(parsed.value.taskKey);
    if (!before) {
      return {
        result: fail(actionType, idempotencyKey, 'failed', 'Tarea no encontrada.', {
          type: 'task',
          key: parsed.value.taskKey,
        }),
        beforeDigest: null,
        afterDigest: null,
        diff: null,
        ownership: null,
        reversible: true,
      };
    }
    const expected = expectedPrevious ?? before.status;
    const beforeDigest = `status:${before.status}`;
    const diff = buildTaskChangeStatusDiff(before.status, parsed.value);
    if (before.status !== expected) {
      return {
        result: fail(
          actionType,
          idempotencyKey,
          'conflict',
          'Conflicto: el estado previo no coincide.',
          {
            type: 'task',
            key: before.key,
          },
        ),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: null,
        reversible: true,
      };
    }
    if (!isValidTaskStatusTransition(before.status, parsed.value.nextStatus)) {
      return {
        result: fail(
          actionType,
          idempotencyKey,
          'invalid-payload',
          'Transición de estado inválida.',
          {
            type: 'task',
            key: before.key,
          },
        ),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: null,
        reversible: true,
      };
    }
    const updated = await deps.tasks.updateTaskStatus(
      before.key,
      parsed.value.nextStatus,
      expected,
    );
    if (!updated.ok) {
      return {
        result: fail(
          actionType,
          idempotencyKey,
          updated.code === 'conflict' ? 'conflict' : 'failed',
          updated.message,
          { type: 'task', key: before.key },
        ),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: null,
        reversible: true,
      };
    }
    const after = await deps.tasks.getTask(before.key);
    const ok = after?.status === parsed.value.nextStatus;
    return {
      result: result({
        ok,
        code: ok ? 'applied' : 'verification-failed',
        message: ok ? 'Estado actualizado.' : 'Verificación posterior falló.',
        idempotencyKey,
        actionType,
        target: { type: 'task', key: before.key },
        summary: ok ? `${before.status} → ${parsed.value.nextStatus}` : null,
        verified: ok,
      }),
      beforeDigest,
      afterDigest: `status:${parsed.value.nextStatus}`,
      diff,
      ownership: null,
      reversible: true,
    };
  }

  if (actionType === 'inbox.capture') {
    const parsed = validateInboxCapture(payload);
    if (!parsed.ok) {
      return {
        result: fail(actionType, idempotencyKey, 'invalid-payload', parsed.message),
        beforeDigest: null,
        afterDigest: null,
        diff: null,
        ownership: null,
        reversible: true,
      };
    }
    const diff = buildInboxCaptureDiff(parsed.value);
    const beforeDigest = digestFromDiff({ fields: [] });
    const written = await deps.inbox.appendCapture(parsed.value, { idempotencyKey });
    if (!written.ok) {
      return {
        result: result({
          ok: false,
          code: 'not-configured',
          message: `${written.message} Texto preservado en el formulario.`,
          idempotencyKey,
          actionType,
          target: { type: 'inbox', key: null },
          summary: parsed.value.text.slice(0, 80),
          verified: false,
        }),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: null,
        reversible: true,
      };
    }
    const verified = await deps.inbox.verifyCapture(written.key);
    const ok = verified.ok && verified.present;
    return {
      result: result({
        ok,
        code: ok ? 'applied' : 'verification-failed',
        message: ok ? 'Captura guardada en Bandeja.' : 'Verificación de captura falló.',
        idempotencyKey,
        actionType,
        target: { type: 'inbox', key: written.key },
        summary: parsed.value.text.slice(0, 80),
        verified: ok,
      }),
      beforeDigest,
      afterDigest: digestFromDiff(diff),
      diff,
      ownership: written.ownership,
      reversible: true,
    };
  }

  if (actionType === 'gym.session.create') {
    const parsed = validateGymSessionCreate(payload);
    if (!parsed.ok) {
      return {
        result: fail(actionType, idempotencyKey, 'invalid-payload', parsed.message),
        beforeDigest: null,
        afterDigest: null,
        diff: null,
        ownership: null,
        reversible: true,
      };
    }
    const sessionId = opaque('gym', idempotencyKey);
    const diff = buildGymSessionDiff(parsed.value);
    const beforeDigest = digestFromDiff({ fields: [] });
    const pending = await deps.gym.createPendingSession(parsed.value, {
      sessionId,
      idempotencyKey,
      createdAt: now,
    });
    if (!pending.ok) {
      return {
        result: fail(actionType, idempotencyKey, 'failed', pending.message, {
          type: 'gym-session',
          key: sessionId,
        }),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: null,
        reversible: true,
      };
    }
    const setsWrite = await deps.gym.writeSets(sessionId, parsed.value.sets);
    if (!setsWrite.ok) {
      await deps.gym.setSessionStatus(sessionId, 'partial');
      return {
        result: result({
          ok: false,
          code: 'partial',
          message: `Sesión parcial: ${setsWrite.message}`,
          idempotencyKey,
          actionType,
          target: { type: 'gym-session', key: sessionId },
          summary: `sets=${setsWrite.written}`,
          verified: false,
        }),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: ownershipFrom(sessionId),
        reversible: true,
      };
    }
    const verified = await deps.gym.verifySession(sessionId, parsed.value.sets.length);
    if (!verified.ok) {
      await deps.gym.setSessionStatus(sessionId, 'failed');
      return {
        result: result({
          ok: false,
          code: 'verification-failed',
          message: verified.message,
          idempotencyKey,
          actionType,
          target: { type: 'gym-session', key: sessionId },
          summary: null,
          verified: false,
        }),
        beforeDigest,
        afterDigest: null,
        diff,
        ownership: ownershipFrom(sessionId),
        reversible: true,
      };
    }
    await deps.gym.setSessionStatus(sessionId, 'complete');
    return {
      result: result({
        ok: true,
        code: 'applied',
        message: 'Sesión de gimnasio registrada.',
        idempotencyKey,
        actionType,
        target: { type: 'gym-session', key: sessionId },
        summary: `${parsed.value.sets.length} sets`,
        verified: true,
      }),
      beforeDigest,
      afterDigest: digestFromDiff(diff),
      diff,
      ownership: ownershipFrom(sessionId),
      reversible: true,
    };
  }

  // calendar.hold.create
  const parsed = validateCalendarHoldCreate(payload);
  if (!parsed.ok) {
    return {
      result: fail(actionType, idempotencyKey, 'invalid-payload', parsed.message),
      beforeDigest: null,
      afterDigest: null,
      diff: null,
      ownership: null,
      reversible: true,
    };
  }
  if (!deps.calendar) {
    return {
      result: fail(
        actionType,
        idempotencyKey,
        'misconfigured',
        'Calendar hold port no configurado.',
      ),
      beforeDigest: null,
      afterDigest: null,
      diff: null,
      ownership: null,
      reversible: true,
    };
  }
  const diff = buildCalendarHoldDiff(parsed.value);
  const beforeDigest = digestFromDiff({ fields: [] });
  const ownership = ownershipFrom(idempotencyKey + parsed.value.title);
  const payloadDigest = digestFromDiff(diff);
  const created = await deps.calendar.createHold(parsed.value, {
    idempotencyKey,
    ownership,
    payloadDigest,
    contractVersion: deps.contractVersion ?? WRITE_CONTRACT_VERSION,
  });
  if (!created.ok) {
    return {
      result: fail(actionType, idempotencyKey, 'failed', created.message, {
        type: 'calendar-hold',
        key: null,
      }),
      beforeDigest,
      afterDigest: null,
      diff,
      ownership: null,
      reversible: true,
    };
  }
  const after = await deps.calendar.getHold(created.key);
  const ok = Boolean(after && after.title === parsed.value.title);
  return {
    result: result({
      ok,
      code: ok ? 'applied' : 'verification-failed',
      message: ok ? 'Hold de Calendar creado.' : 'Verificación de hold falló.',
      idempotencyKey,
      actionType,
      target: { type: 'calendar-hold', key: created.key },
      summary: ok ? parsed.value.title : null,
      verified: ok,
    }),
    beforeDigest,
    afterDigest: digestFromDiff(diff),
    diff,
    ownership: created.ownership,
    reversible: true,
  };
}

async function compensateBusiness(input: {
  actionType: string;
  targetKey: string | null;
  ownership: OwnershipProof | null;
  deps: HandlerDeps;
  diff?: ActionDiff | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { actionType, targetKey, ownership, deps, diff } = input;
  if (!targetKey) return { ok: false, message: 'Target ausente para rollback.' };

  if (actionType === 'task.create') {
    if (!ownership) return { ok: false, message: 'Ownership ausente.' };
    const archived = await deps.tasks.archiveOwnedTask(targetKey, ownership);
    if (!archived.ok) return { ok: false, message: archived.message };
    const stillActive = await deps.tasks.getTask(targetKey);
    if (stillActive) {
      return { ok: false, message: 'La tarea sigue activa tras el rollback.' };
    }
    return { ok: true };
  }
  if (actionType === 'inbox.capture') {
    if (!ownership) return { ok: false, message: 'Ownership ausente.' };
    const archived = await deps.inbox.archiveCapture(targetKey, ownership);
    if (!archived.ok) return { ok: false, message: archived.message };
    const verified = await deps.inbox.verifyCapture(targetKey);
    if (!verified.ok || verified.present) {
      return { ok: false, message: 'Verificación de rollback de captura falló.' };
    }
    return { ok: true };
  }
  if (actionType === 'gym.session.create') {
    const reverted = await deps.gym.markReverted(targetKey);
    return reverted.ok ? { ok: true } : { ok: false, message: reverted.message };
  }
  if (actionType === 'calendar.hold.create') {
    if (!deps.calendar || !ownership) return { ok: false, message: 'Calendar/ownership ausente.' };
    const deleted = await deps.calendar.deleteHoldWithOwnership(targetKey, ownership);
    if (!deleted.ok) return { ok: false, message: deleted.message };
    const verified = await deps.calendar.verifyHoldAbsent(targetKey);
    if (!verified.ok) {
      return { ok: false, message: 'No se pudo verificar la ausencia del hold.' };
    }
    if (!verified.absent) {
      return { ok: false, message: 'Hold todavía activo tras rollback.' };
    }
    return { ok: true };
  }
  if (actionType === 'task.change-status') {
    const statusField = diff?.fields.find((field) => field.field === 'status');
    if (!statusField) {
      return { ok: false, message: 'Diff de estado ausente para rollback.' };
    }
    const beforeStatus = typeof statusField.before === 'string' ? statusField.before : null;
    const afterStatus = typeof statusField.after === 'string' ? statusField.after : null;
    if (!beforeStatus || !afterStatus) {
      return { ok: false, message: 'Diff de estado incompleto.' };
    }
    const current = await deps.tasks.getTask(targetKey);
    if (!current) return { ok: false, message: 'Tarea no encontrada.' };
    if (current.status !== afterStatus) {
      return { ok: false, message: 'Conflicto: estado actual distinto al after del diff.' };
    }
    const updated = await deps.tasks.updateTaskStatus(
      targetKey,
      beforeStatus as TaskChangeStatusPayload['nextStatus'],
      afterStatus,
    );
    if (!updated.ok) return { ok: false, message: updated.message };
    const verified = await deps.tasks.getTask(targetKey);
    if (!verified || verified.status !== beforeStatus) {
      return { ok: false, message: 'Verificación de rollback de estado falló.' };
    }
    return { ok: true };
  }
  return { ok: false, message: 'Tipo no reversible.' };
}

async function handleProposalCreate(input: {
  payload: unknown;
  idempotencyKey: string;
  deps: HandlerDeps;
}): Promise<ActionResult> {
  const { payload, idempotencyKey, deps } = input;
  const now = deps.now?.() ?? new Date().toISOString();
  const parsed = validateProposalCreate(payload);
  if (!parsed.ok) {
    return fail('proposal.create', idempotencyKey, 'invalid-payload', parsed.message);
  }
  if (!deps.encryptionStore || !deps.encryptionKey) {
    return fail(
      'proposal.create',
      idempotencyKey,
      'misconfigured',
      'Cifrado de propuestas no disponible.',
    );
  }

  const preflight = await preflightBusinessProposal(
    parsed.value.proposedActionType,
    parsed.value.payload,
    deps,
  );
  if (!preflight.ok) {
    return fail('proposal.create', idempotencyKey, preflight.code, preflight.message);
  }

  const beforeDigest = preflight.beforeDigest;
  const diff = preflight.diff;

  const plaintext = JSON.stringify({
    proposedActionType: parsed.value.proposedActionType,
    payload: parsed.value.payload,
  });
  const digest = payloadDigest(plaintext);
  const envelope = encryptProposalPayload(deps.encryptionKey, plaintext);
  const key = opaque('prop', idempotencyKey);
  const encKey = encryptedPayloadStorageKey(key, digest);
  const ttl = deps.approvalTtlSeconds ?? 86_400;
  const expiresAt = new Date(Date.parse(now) + ttl * 1000).toISOString();

  await deps.encryptionStore.put(encKey, envelope, ttl);

  const created = await deps.proposals.create(parsed.value, {
    key,
    idempotencyKey,
    createdAt: now,
    expiresAt,
    payloadDigest: digest,
    contractVersion: deps.contractVersion ?? WRITE_CONTRACT_VERSION,
    source: deps.source ?? 'web',
    beforeDigest,
    diff,
    encryptedPayloadKey: encKey,
  });

  return result({
    ok: true,
    code: 'applied',
    message: 'Propuesta creada.',
    idempotencyKey,
    actionType: 'proposal.create',
    target: { type: 'proposal', key: created.key },
    summary: created.name,
    verified: true,
  });
}

async function handleProposalDecide(input: {
  actionType: 'proposal.approve' | 'proposal.reject';
  payload: unknown;
  idempotencyKey: string;
  deps: HandlerDeps;
}): Promise<ActionResult> {
  const { actionType, payload, idempotencyKey, deps } = input;
  const now = deps.now?.() ?? new Date().toISOString();
  const parsed = validateProposalDecide(payload);
  if (!parsed.ok) {
    return fail(actionType, idempotencyKey, 'invalid-payload', parsed.message);
  }

  const existing = await deps.proposals.get(parsed.value.proposalKey);
  if (!existing) {
    return fail(actionType, idempotencyKey, 'failed', 'Propuesta no encontrada.', {
      type: 'proposal',
      key: parsed.value.proposalKey,
    });
  }

  if (
    existing.status === 'expired' ||
    (existing.expiresAt && Date.parse(existing.expiresAt) < Date.parse(now))
  ) {
    const expired = await casUpdateStatus(
      deps,
      existing.key,
      'expired',
      {
        decidedAt: now,
        resultCode: 'expired',
      },
      existing.status === 'pending' ? 'pending' : existing.status,
    );
    if (!expired && existing.status === 'pending') {
      return fail(actionType, idempotencyKey, 'conflict', 'Conflicto de estado de propuesta.', {
        type: 'proposal',
        key: existing.key,
      });
    }
    if (existing.encryptedPayloadKey && deps.encryptionStore) {
      await deps.encryptionStore.delete(existing.encryptedPayloadKey);
    }
    return fail(actionType, idempotencyKey, 'expired', 'La propuesta expiró.', {
      type: 'proposal',
      key: existing.key,
    });
  }

  if (existing.status !== 'pending') {
    return fail(actionType, idempotencyKey, 'conflict', 'La propuesta ya fue decidida.', {
      type: 'proposal',
      key: existing.key,
    });
  }

  const purpose = actionType === 'proposal.approve' ? 'approve' : 'reject';
  let leaseToken: string | null = null;
  if (deps.coordination) {
    const lease = await deps.coordination.acquireProposalLease({
      proposalKey: existing.key,
      purpose,
      ttlSeconds: 120,
    });
    if (lease.status !== 'acquired') {
      return fail(
        actionType,
        idempotencyKey,
        lease.status === 'conflict' ? 'lease-conflict' : 'misconfigured',
        'No se pudo adquirir lease de propuesta.',
        { type: 'proposal', key: existing.key },
      );
    }
    leaseToken = lease.token;
  }

  try {
    if (actionType === 'proposal.reject') {
      const rejected = await casUpdateStatus(
        deps,
        existing.key,
        'rejected',
        {
          decidedAt: now,
          resultCode: 'rejected',
          afterSummary: 'Rechazada',
        },
        'pending',
      );
      if (!rejected) {
        return fail(actionType, idempotencyKey, 'conflict', 'Conflicto de estado (reject).', {
          type: 'proposal',
          key: existing.key,
        });
      }
      if (existing.encryptedPayloadKey && deps.encryptionStore) {
        await deps.encryptionStore.delete(existing.encryptedPayloadKey);
      }
      return result({
        ok: true,
        code: 'applied',
        message: 'Propuesta rechazada.',
        idempotencyKey,
        actionType,
        target: { type: 'proposal', key: existing.key },
        summary: 'Rechazada',
        verified: true,
      });
    }

    // approve → executing → apply business
    const executing = await casUpdateStatus(
      deps,
      existing.key,
      'executing',
      {
        decidedAt: now,
        executionStartedAt: now,
        resultCode: 'executing',
      },
      'pending',
    );
    if (!executing) {
      return fail(actionType, idempotencyKey, 'conflict', 'Conflicto de estado (approve).', {
        type: 'proposal',
        key: existing.key,
      });
    }

    if (!deps.encryptionStore || !deps.encryptionKey || !existing.encryptedPayloadKey) {
      await casUpdateStatus(
        deps,
        existing.key,
        'failed',
        {
          resultCode: 'misconfigured',
          afterSummary: 'Sin ciphertext',
        },
        'executing',
      );
      return fail(actionType, idempotencyKey, 'misconfigured', 'Payload cifrado ausente.', {
        type: 'proposal',
        key: existing.key,
      });
    }

    const envelope = await deps.encryptionStore.get(existing.encryptedPayloadKey);
    if (!envelope) {
      await casUpdateStatus(
        deps,
        existing.key,
        'failed',
        {
          resultCode: 'expired',
          afterSummary: 'Ciphertext expirado',
        },
        'executing',
      );
      return fail(actionType, idempotencyKey, 'expired', 'Payload cifrado expirado.', {
        type: 'proposal',
        key: existing.key,
      });
    }

    let decrypted: { proposedActionType: string; payload: unknown };
    try {
      decrypted = JSON.parse(decryptProposalPayload(deps.encryptionKey, envelope)) as {
        proposedActionType: string;
        payload: unknown;
      };
    } catch {
      await casUpdateStatus(
        deps,
        existing.key,
        'failed',
        {
          resultCode: 'failed',
          afterSummary: 'Decrypt failed',
        },
        'executing',
      );
      return fail(actionType, idempotencyKey, 'failed', 'No se pudo descifrar el payload.', {
        type: 'proposal',
        key: existing.key,
      });
    }

    if (!isBusinessActionType(decrypted.proposedActionType)) {
      await casUpdateStatus(
        deps,
        existing.key,
        'failed',
        { resultCode: 'invalid-payload' },
        'executing',
      );
      return fail(actionType, idempotencyKey, 'invalid-payload', 'Acción propuesta inválida.', {
        type: 'proposal',
        key: existing.key,
      });
    }

    // Re-read beforeDigest compare for status changes
    if (decrypted.proposedActionType === 'task.change-status') {
      const p = decrypted.payload as { taskKey: string };
      const before = await deps.tasks.getTask(p.taskKey);
      const currentDigest = before ? `status:${before.status}` : null;
      if (existing.beforeDigest && currentDigest !== existing.beforeDigest) {
        await casUpdateStatus(
          deps,
          existing.key,
          'failed',
          {
            resultCode: 'conflict',
            afterSummary: 'beforeDigest mismatch',
          },
          'executing',
        );
        return fail(
          actionType,
          idempotencyKey,
          'conflict',
          'El estado previo cambió desde la propuesta.',
          { type: 'proposal', key: existing.key },
        );
      }
    }

    const executed = await executeBusinessAction({
      actionType: decrypted.proposedActionType,
      payload: decrypted.payload,
      expectedPrevious: null,
      idempotencyKey: `${idempotencyKey}:exec`,
      deps,
    });

    await deps.encryptionStore.delete(existing.encryptedPayloadKey);

    if (!executed.result.ok) {
      const failed = await casUpdateStatus(
        deps,
        existing.key,
        'failed',
        {
          resultCode: executed.result.code,
          afterSummary: executed.result.message,
          targetKey: executed.result.target?.key ?? existing.targetKey,
        },
        'executing',
      );
      if (!failed) {
        return fail(actionType, idempotencyKey, 'conflict', 'Conflicto al marcar failed.', {
          type: 'proposal',
          key: existing.key,
        });
      }
      return result({
        ...executed.result,
        actionType,
        target: { type: 'proposal', key: existing.key },
        message: `Ejecución fallida: ${executed.result.message}`,
      });
    }

    const rollbackWindow = deps.rollbackWindowSeconds ?? 604_800;
    const rollbackDeadline =
      existing.reversible && executed.reversible
        ? new Date(Date.parse(now) + rollbackWindow * 1000).toISOString()
        : null;

    const applied = await casUpdateStatus(
      deps,
      existing.key,
      'applied',
      {
        appliedAt: now,
        resultCode: 'applied',
        afterSummary: executed.result.summary,
        beforeSummary: executed.beforeDigest,
        beforeDigest: executed.beforeDigest,
        diff: executed.diff,
        targetKey: executed.result.target?.key ?? existing.targetKey,
        rollbackDeadline,
        ownershipDigest: executed.ownership,
        encryptedPayloadKey: null,
      },
      'executing',
    );
    if (!applied) {
      return fail(actionType, idempotencyKey, 'conflict', 'Conflicto al marcar applied.', {
        type: 'proposal',
        key: existing.key,
      });
    }

    return result({
      ok: true,
      code: 'applied',
      message: 'Propuesta aprobada y aplicada.',
      idempotencyKey,
      actionType,
      target: { type: 'proposal', key: existing.key },
      summary: executed.result.summary,
      verified: true,
    });
  } finally {
    if (deps.coordination && leaseToken) {
      await deps.coordination.releaseProposalLease({
        proposalKey: existing.key,
        purpose,
        token: leaseToken,
      });
    }
  }
}

async function handleRollback(input: {
  payload: unknown;
  idempotencyKey: string;
  deps: HandlerDeps;
}): Promise<ActionResult> {
  const { payload, idempotencyKey, deps } = input;
  const now = deps.now?.() ?? new Date().toISOString();
  const parsed = validateActionRollback(payload);
  if (!parsed.ok) {
    return fail('action.rollback', idempotencyKey, 'invalid-payload', parsed.message);
  }

  const existing = await deps.proposals.get(parsed.value.proposalKey);
  if (!existing) {
    return fail('action.rollback', idempotencyKey, 'failed', 'Propuesta no encontrada.', {
      type: 'proposal',
      key: parsed.value.proposalKey,
    });
  }

  if (existing.status !== 'applied') {
    return fail(
      'action.rollback',
      idempotencyKey,
      'conflict',
      'Solo se pueden revertir propuestas aplicadas.',
      { type: 'proposal', key: existing.key },
    );
  }
  if (!existing.reversible) {
    return fail(
      'action.rollback',
      idempotencyKey,
      'policy-denied',
      'La propuesta no es reversible.',
      { type: 'proposal', key: existing.key },
    );
  }
  if (existing.rollbackDeadline && Date.parse(existing.rollbackDeadline) < Date.parse(now)) {
    return fail('action.rollback', idempotencyKey, 'expired', 'Ventana de rollback expirada.', {
      type: 'proposal',
      key: existing.key,
    });
  }

  let leaseToken: string | null = null;
  if (deps.coordination) {
    const lease = await deps.coordination.acquireProposalLease({
      proposalKey: existing.key,
      purpose: 'rollback',
      ttlSeconds: 120,
    });
    if (lease.status !== 'acquired') {
      return fail(
        'action.rollback',
        idempotencyKey,
        lease.status === 'conflict' ? 'lease-conflict' : 'misconfigured',
        'No se pudo adquirir lease de rollback.',
        { type: 'proposal', key: existing.key },
      );
    }
    leaseToken = lease.token;
  }

  try {
    const rolling = await casUpdateStatus(
      deps,
      existing.key,
      'rolling-back',
      {
        resultCode: 'rolling-back',
      },
      'applied',
    );
    if (!rolling) {
      return fail(
        'action.rollback',
        idempotencyKey,
        'conflict',
        'Conflicto de estado (rollback).',
        { type: 'proposal', key: existing.key },
      );
    }

    const compensated = await compensateBusiness({
      actionType: existing.actionType,
      targetKey: existing.targetKey,
      ownership: existing.ownershipDigest ?? null,
      deps,
      diff: existing.diff,
    });

    if (!compensated.ok) {
      const failed = await casUpdateStatus(
        deps,
        existing.key,
        'rollback-failed',
        {
          resultCode: 'rollback-failed',
          afterSummary: compensated.message,
        },
        'rolling-back',
      );
      if (!failed) {
        return fail(
          'action.rollback',
          idempotencyKey,
          'conflict',
          'Conflicto al marcar rollback-failed.',
          { type: 'proposal', key: existing.key },
        );
      }
      return result({
        ok: false,
        code: 'rollback-failed',
        message: compensated.message,
        idempotencyKey,
        actionType: 'action.rollback',
        target: { type: 'proposal', key: existing.key },
        summary: null,
        verified: false,
      });
    }

    const rolled = await casUpdateStatus(
      deps,
      existing.key,
      'rolled-back',
      {
        rolledBackAt: now,
        resultCode: 'rolled-back',
        afterSummary: 'Revertida',
      },
      'rolling-back',
    );
    if (!rolled) {
      return fail(
        'action.rollback',
        idempotencyKey,
        'conflict',
        'Conflicto al marcar rolled-back.',
        { type: 'proposal', key: existing.key },
      );
    }

    return result({
      ok: true,
      code: 'rolled-back',
      message: 'Propuesta revertida.',
      idempotencyKey,
      actionType: 'action.rollback',
      target: { type: 'proposal', key: existing.key },
      summary: 'Revertida',
      verified: true,
    });
  } finally {
    if (deps.coordination && leaseToken) {
      await deps.coordination.releaseProposalLease({
        proposalKey: existing.key,
        purpose: 'rollback',
        token: leaseToken,
      });
    }
  }
}

export async function handleAllowedAction(input: {
  actionType: AllowedActionType;
  payload: unknown;
  expectedPrevious: string | null;
  idempotencyKey: string;
  deps: HandlerDeps;
}): Promise<ActionResult> {
  const { actionType, payload, idempotencyKey, deps, expectedPrevious } = input;

  if (isBusinessActionType(actionType)) {
    const outcome = await executeBusinessAction({
      actionType,
      payload,
      expectedPrevious,
      idempotencyKey,
      deps,
    });
    return outcome.result;
  }

  if (actionType === 'proposal.create') {
    return handleProposalCreate({ payload, idempotencyKey, deps });
  }

  if (actionType === 'proposal.approve' || actionType === 'proposal.reject') {
    return handleProposalDecide({ actionType, payload, idempotencyKey, deps });
  }

  if (actionType === 'action.rollback') {
    return handleRollback({ payload, idempotencyKey, deps });
  }

  return fail(actionType, idempotencyKey, 'failed', 'Handler no implementado.');
}

export { executeBusinessAction, compensateBusiness };
