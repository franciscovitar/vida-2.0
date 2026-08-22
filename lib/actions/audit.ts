/**
 * Auditoría sanitizada (sin tokens, URLs privadas, Journaling ni payloads sensibles).
 */
import type { ActionAuditRecord, ActionResult, ConfirmationMode } from '@/types/actions';

export type AuditAppendResult = { ok: true } | { ok: false; message: string };

export interface AuditSink {
  append(record: ActionAuditRecord): Promise<AuditAppendResult>;
  list(): Promise<readonly ActionAuditRecord[]>;
}

export function sanitizeActorHint(actor: string): string {
  const trimmed = actor.trim().toLowerCase();
  if (trimmed.startsWith('openclaw:')) {
    const id = trimmed.slice('openclaw:'.length);
    if (!id) return 'openclaw:***';
    return id.length <= 2 ? `openclaw:${id[0] ?? '*'}*` : `openclaw:${id.slice(0, 2)}***`;
  }
  const at = trimmed.indexOf('@');
  if (at <= 0) return 'user';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const hint = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***`;
  return `${hint}@${domain}`;
}

export function createMemoryAuditSink(): AuditSink {
  const rows: ActionAuditRecord[] = [];
  return {
    async append(record) {
      rows.push(record);
      return { ok: true };
    },
    async list() {
      return rows;
    },
  };
}

export const processAuditSink = createMemoryAuditSink();

export async function recordActionAudit(
  sink: AuditSink,
  input: {
    actionType: string;
    /** Preferir actorHint; actorEmail solo para derivar hint (compat). */
    actorHint?: string;
    actorEmail?: string;
    result: ActionResult;
    confirmationMode: ConfirmationMode | 'none';
    at?: string;
    targetType?: string | null;
    risk?: string | null;
    reversible?: boolean | null;
    beforeSummary?: string | null;
    afterSummary?: string | null;
    idempotencyDigest?: string | null;
    sagaPhase?: string | null;
  },
): Promise<
  | { ok: true; record: ActionAuditRecord }
  | { ok: false; record: ActionAuditRecord; message: string }
> {
  const actorHint =
    input.actorHint?.trim() || (input.actorEmail ? sanitizeActorHint(input.actorEmail) : 'user');
  const record: ActionAuditRecord = {
    actionType: input.actionType,
    actorHint,
    at: input.at ?? new Date().toISOString(),
    resultCode: input.result.code,
    confirmationMode: input.confirmationMode,
    idempotencyKey: input.result.idempotencyKey,
    errorCode: input.result.ok ? null : input.result.code,
    targetKey: input.result.target?.key ?? null,
    verified: input.result.verified,
    targetType: input.targetType ?? input.result.target?.type ?? null,
    risk: input.risk ?? null,
    reversible: input.reversible ?? null,
    beforeSummary: input.beforeSummary ?? null,
    afterSummary: input.afterSummary ?? input.result.summary,
    idempotencyDigest: input.idempotencyDigest ?? null,
    sagaPhase: input.sagaPhase ?? null,
  };
  const appended = await sink.append(record);
  if (!appended.ok) {
    return { ok: false, record, message: appended.message };
  }
  return { ok: true, record };
}

/** Garantiza que un registro no contenga secretos obvios. */
export function auditLooksSafe(record: ActionAuditRecord): boolean {
  const json = JSON.stringify(record);
  if (/secret_|Bearer |BEGIN PRIVATE|notion\.so|https?:\/\//i.test(json)) return false;
  if (/journal/i.test(json)) return false;
  return true;
}
