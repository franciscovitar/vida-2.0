/**
 * Creación de propuestas vía motor 8E (sin escrituras finales).
 */
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { executeAction } from '@/lib/actions/engine';
import { buildWriteRuntime, listRuntimeProposals } from '@/lib/actions/runtime';
import type { OpenClawProposalRequest, OpenClawProposeOperation } from '@/types/openclaw';
import type { ActionResult, AllowedActionType } from '@/types/actions';

const PROPOSE_TO_ACTION: Record<
  OpenClawProposeOperation,
  AllowedActionType | 'calendar.block.propose'
> = {
  'task.create.propose': 'task.create',
  'task.change-status.propose': 'task.change-status',
  'inbox.capture.propose': 'inbox.capture',
  'gym.session.create.propose': 'gym.session.create',
  'calendar.block.propose': 'calendar.block.propose',
};

export function isOpenClawProposeOperation(value: string): value is OpenClawProposeOperation {
  return value in PROPOSE_TO_ACTION;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseOpenClawProposalRequest(
  body: unknown,
): { ok: true; value: OpenClawProposalRequest } | { ok: false; message: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, message: 'Body inválido.' };
  const operation = typeof record.operation === 'string' ? record.operation : '';
  if (!isOpenClawProposeOperation(operation)) {
    return { ok: false, message: 'Operación de propuesta no permitida.' };
  }
  const idempotencyKey =
    typeof record.idempotencyKey === 'string' ? record.idempotencyKey.trim() : '';
  if (!idempotencyKey) {
    return { ok: false, message: 'idempotencyKey requerido.' };
  }
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
  const expectedChange =
    typeof record.expectedChange === 'string' ? record.expectedChange.trim() : '';
  if (!reason || !expectedChange) {
    return { ok: false, message: 'reason y expectedChange requeridos.' };
  }
  const risk = record.risk;
  if (risk !== 'low' && risk !== 'medium' && risk !== 'high') {
    return { ok: false, message: 'risk inválido.' };
  }
  if (typeof record.reversible !== 'boolean') {
    return { ok: false, message: 'reversible requerido.' };
  }
  const payload = asRecord(record.payload);
  if (!payload) return { ok: false, message: 'payload requerido.' };
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      sanitized[key] = value;
    }
  }
  return {
    ok: true,
    value: {
      operation,
      idempotencyKey,
      reason,
      expectedChange,
      risk,
      reversible: record.reversible,
      payload: sanitized,
      targetKey: typeof record.targetKey === 'string' ? record.targetKey : null,
    },
  };
}

export async function createOpenClawProposal(input: {
  actorId: string;
  request: OpenClawProposalRequest;
  requestId: string;
}): Promise<
  | {
      ok: true;
      proposalKey: string;
      replay: boolean;
      summary: string | null;
      result: ActionResult;
    }
  | { ok: false; code: string; message: string }
> {
  if (!isWriteActionsEnabled()) {
    return {
      ok: false,
      code: 'flag-disabled',
      message: 'WRITE_ACTIONS_ENABLED debe estar activo para persistir propuestas.',
    };
  }

  const proposed = PROPOSE_TO_ACTION[input.request.operation];
  const isCalendarBlock = input.request.operation === 'calendar.block.propose';
  const targetType = isCalendarBlock
    ? 'calendar-block'
    : proposed === 'inbox.capture'
      ? 'inbox'
      : proposed === 'gym.session.create'
        ? 'gym-session'
        : typeof proposed === 'string' && proposed.startsWith('task.')
          ? 'task'
          : 'system';

  const runtime = buildWriteRuntime();
  const result = await executeAction(
    {
      actionType: 'proposal.create',
      actorEmail: input.actorId,
      payload: isCalendarBlock
        ? {
            title: String(input.request.payload.title ?? 'Bloque propuesto'),
            date: String(input.request.payload.date ?? ''),
            startTime: String(input.request.payload.startTime ?? ''),
            endTime: String(input.request.payload.endTime ?? ''),
            reason: input.request.reason,
            relatedTaskKey:
              typeof input.request.payload.relatedTaskKey === 'string'
                ? input.request.payload.relatedTaskKey
                : null,
          }
        : {
            name: `OpenClaw: ${input.request.operation}`,
            proposedActionType: proposed,
            targetType,
            targetKey: input.request.targetKey ?? null,
            reason: input.request.reason,
            expectedChange: input.request.expectedChange,
            risk: input.request.risk,
            reversible: input.request.reversible,
            sanitizedPayload: {
              ...input.request.payload,
              origin: 'openclaw',
              requestId: input.requestId,
            },
          },
      idempotencyKey: input.request.idempotencyKey,
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'openclaw', targetDate: null },
    },
    {
      writesEnabled: true,
      idempotency: runtime.idempotency,
      audit: runtime.audit,
      handlers: runtime.handlers,
    },
  );

  if (!result.ok && result.code !== 'idempotent-replay') {
    return {
      ok: false,
      code: result.code,
      message: result.message,
    };
  }

  const proposalKey = result.target?.key ?? '';
  return {
    ok: true,
    proposalKey,
    replay: result.code === 'idempotent-replay',
    summary: result.summary,
    result,
  };
}

export async function getOpenClawProposal(key: string) {
  const proposals = await listRuntimeProposals();
  return proposals.find((row) => row.key === key) ?? null;
}
