/**
 * Helpers de saga: intention antes de write, finalize después.
 */
import { recordActionAudit, type AuditSink } from '@/lib/actions/audit';
import type { ActionConfirmation, ActionResult, ActionResultCode } from '@/types/actions';

export type SagaPhase = 'reserved' | 'intention' | 'executed' | 'verified' | 'finalized';

export async function recordSagaIntention(
  sink: AuditSink,
  input: {
    actionType: string;
    actorHint: string;
    actorEmailForHint?: string;
    result: ActionResult;
    confirmationMode: ActionConfirmation['mode'] | 'none';
    idempotencyDigest: string;
    beforeSummary?: string | null;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const audited = await recordActionAudit(sink, {
    actionType: input.actionType,
    actorHint: input.actorHint,
    actorEmail: input.actorEmailForHint,
    result: {
      ...input.result,
      code: 'in-progress' as ActionResultCode,
      message: 'Intención registrada; escritura pendiente.',
      ok: true,
    },
    confirmationMode: input.confirmationMode,
    idempotencyDigest: input.idempotencyDigest,
    beforeSummary: input.beforeSummary ?? null,
    afterSummary: null,
    sagaPhase: 'intention',
  });
  return audited.ok ? { ok: true } : { ok: false, message: audited.message };
}

export async function recordSagaFinalize(
  sink: AuditSink,
  input: {
    actionType: string;
    actorHint: string;
    actorEmailForHint?: string;
    result: ActionResult;
    confirmationMode: ActionConfirmation['mode'] | 'none';
    idempotencyDigest: string;
    beforeSummary?: string | null;
    afterSummary?: string | null;
    phase?: SagaPhase;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const audited = await recordActionAudit(sink, {
    actionType: input.actionType,
    actorHint: input.actorHint,
    actorEmail: input.actorEmailForHint,
    result: input.result,
    confirmationMode: input.confirmationMode,
    idempotencyDigest: input.idempotencyDigest,
    beforeSummary: input.beforeSummary ?? null,
    afterSummary: input.afterSummary ?? input.result.summary,
    sagaPhase: input.phase ?? 'finalized',
  });
  return audited.ok ? { ok: true } : { ok: false, message: audited.message };
}

/**
 * Si la escritura ok pero el finalize de auditoría falla → applied-audit-pending.
 */
export function applyAuditPendingIfNeeded(result: ActionResult, auditOk: boolean): ActionResult {
  if (result.ok && !auditOk) {
    return {
      ...result,
      code: 'applied-audit-pending',
      message: 'Escritura aplicada; la auditoría requiere revisión (no se reintentó la acción).',
    };
  }
  return result;
}
