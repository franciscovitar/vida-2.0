/**
 * Auditoría sanitizada (sin tokens, URLs privadas, Journaling ni payloads sensibles).
 */
import type { ActionAuditRecord, ActionResult, ConfirmationMode } from '@/types/actions';

export interface AuditSink {
  append(record: ActionAuditRecord): void;
  list(): readonly ActionAuditRecord[];
}

export function sanitizeActorHint(email: string): string {
  const trimmed = email.trim().toLowerCase();
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
    append(record) {
      rows.push(record);
    },
    list() {
      return rows;
    },
  };
}

export const processAuditSink = createMemoryAuditSink();

export function recordActionAudit(
  sink: AuditSink,
  input: {
    actionType: string;
    actorEmail: string;
    result: ActionResult;
    confirmationMode: ConfirmationMode | 'none';
    at?: string;
  },
): ActionAuditRecord {
  const record: ActionAuditRecord = {
    actionType: input.actionType,
    actorHint: sanitizeActorHint(input.actorEmail),
    at: input.at ?? new Date().toISOString(),
    resultCode: input.result.code,
    confirmationMode: input.confirmationMode,
    idempotencyKey: input.result.idempotencyKey,
    errorCode: input.result.ok ? null : input.result.code,
    targetKey: input.result.target?.key ?? null,
    verified: input.result.verified,
  };
  sink.append(record);
  return record;
}

/** Garantiza que un registro no contenga secretos obvios. */
export function auditLooksSafe(record: ActionAuditRecord): boolean {
  const json = JSON.stringify(record);
  if (/secret_|Bearer |BEGIN PRIVATE|notion\.so|https?:\/\//i.test(json)) return false;
  if (/journal/i.test(json)) return false;
  return true;
}
