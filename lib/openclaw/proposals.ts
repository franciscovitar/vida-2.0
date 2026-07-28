/**
 * Creación de propuestas vía motor Block 3 (sin escrituras finales ni approve).
 */
import { isOpenClawProposalsEnabled } from '@/lib/actions/config';
import { executeAction } from '@/lib/actions/engine';
import { requestFromOpenClawKeyId } from '@/lib/actions/request';
import { buildWriteRuntime } from '@/lib/actions/runtime';
import type {
  OpenClawProposalDiff,
  OpenClawProposalRequest,
  OpenClawProposeOperation,
} from '@/types/openclaw';
import type {
  ActionProposalSummary,
  ActionResult,
  CalendarHoldCreatePayload,
  InboxCapturePayload,
  ProposedBusinessActionType,
} from '@/types/actions';

const PROPOSE_TO_ACTION: Record<OpenClawProposeOperation, ProposedBusinessActionType> = {
  'task.create.propose': 'task.create',
  'task.change-status.propose': 'task.change-status',
  'inbox.capture.propose': 'inbox.capture',
  'gym.session.create.propose': 'gym.session.create',
  'calendar.hold.create.propose': 'calendar.hold.create',
  'calendar.block.propose': 'calendar.hold.create',
};

const ACTOR_BODY_KEYS = new Set(['actor', 'actorId', 'actorHash', 'actorHint', 'email', 'user']);

export function isOpenClawProposeOperation(value: string): value is OpenClawProposeOperation {
  return value in PROPOSE_TO_ACTION;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function sanitizeOpenClawProposalDiff(
  diff: ActionProposalSummary['diff'],
): OpenClawProposalDiff | null {
  if (!diff || !Array.isArray(diff.fields)) return null;
  return {
    fields: diff.fields.map((field) => ({
      field: field.field,
      before: field.before,
      after: field.after,
    })),
    ...(diff.warnings ? { warnings: [...diff.warnings] } : {}),
  };
}

export function toOpenClawProposalMetadata(row: ActionProposalSummary) {
  return {
    proposalKey: row.key,
    status: row.status,
    operation: row.actionType,
    risk: row.risk,
    reversible: row.reversible,
    expiresAt: row.expiresAt,
    summary: row.name,
    diff: sanitizeOpenClawProposalDiff(row.diff),
    source: row.source,
  };
}

export function parseOpenClawProposalRequest(
  body: unknown,
): { ok: true; value: OpenClawProposalRequest } | { ok: false; message: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, message: 'Body inválido.' };

  for (const key of Object.keys(record)) {
    if (ACTOR_BODY_KEYS.has(key)) {
      return { ok: false, message: 'Actor no permitido en el body.' };
    }
  }

  if (typeof record.actionType === 'string') {
    return { ok: false, message: 'actionType no permitido; use operation de propuesta.' };
  }

  const operation = typeof record.operation === 'string' ? record.operation : '';
  if (
    operation === 'proposal.approve' ||
    operation === 'proposal.reject' ||
    operation === 'action.rollback' ||
    operation === 'proposal.create'
  ) {
    return { ok: false, message: 'Operación de control no permitida vía OpenClaw.' };
  }
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

function buildCalendarHoldPayload(
  payload: Record<string, string | number | boolean | null>,
): CalendarHoldCreatePayload {
  if (typeof payload.start === 'string' && typeof payload.end === 'string') {
    return {
      title: String(payload.title ?? 'Hold propuesto'),
      start: payload.start,
      end: payload.end,
      note: typeof payload.note === 'string' ? payload.note : null,
      relatedTaskKey: typeof payload.relatedTaskKey === 'string' ? payload.relatedTaskKey : null,
    };
  }
  const date = String(payload.date ?? '');
  const startTime = String(payload.startTime ?? '10:00');
  const endTime = String(payload.endTime ?? '11:00');
  return {
    title: String(payload.title ?? 'Hold propuesto'),
    start: `${date}T${startTime}:00.000Z`,
    end: `${date}T${endTime}:00.000Z`,
    note: typeof payload.reason === 'string' ? payload.reason : null,
    relatedTaskKey: typeof payload.relatedTaskKey === 'string' ? payload.relatedTaskKey : null,
  };
}

function buildInboxCapturePayload(
  payload: Record<string, string | number | boolean | null>,
): InboxCapturePayload {
  return {
    text: String(payload.text ?? ''),
    link: typeof payload.link === 'string' ? payload.link : null,
    capturedAt:
      typeof payload.capturedAt === 'string' ? payload.capturedAt : new Date().toISOString(),
    origin: 'openclaw',
  };
}

type RuntimeOverrides = NonNullable<Parameters<typeof buildWriteRuntime>[1]>;

export async function createOpenClawProposal(input: {
  keyId: string;
  request: OpenClawProposalRequest;
  requestId: string;
  env?: Readonly<Record<string, string | undefined>>;
  runtimeOverrides?: RuntimeOverrides;
}): Promise<
  | {
      ok: true;
      proposalKey: string;
      replay: boolean;
      summary: string | null;
      risk: 'low' | 'medium' | 'high';
      expiresAt: string | null;
      diff: OpenClawProposalDiff | null;
      result: ActionResult;
    }
  | { ok: false; code: string; message: string }
> {
  const env = input.env ?? process.env;
  if (!isOpenClawProposalsEnabled(env)) {
    return {
      ok: false,
      code: 'flag-disabled',
      message: 'OpenClaw proposals desactivadas.',
    };
  }

  const proposed = PROPOSE_TO_ACTION[input.request.operation];
  const isCalendarHold = proposed === 'calendar.hold.create';
  const targetType = isCalendarHold
    ? 'calendar-hold'
    : proposed === 'inbox.capture'
      ? 'inbox'
      : proposed === 'gym.session.create'
        ? 'gym-session'
        : proposed.startsWith('task.')
          ? 'task'
          : 'system';

  const businessPayload = isCalendarHold
    ? buildCalendarHoldPayload(input.request.payload)
    : proposed === 'inbox.capture'
      ? buildInboxCapturePayload(input.request.payload)
      : ({
          ...input.request.payload,
        } as never);

  const runtime = buildWriteRuntime(env, input.runtimeOverrides);
  const result = await executeAction(
    requestFromOpenClawKeyId(input.keyId, {
      actionType: 'proposal.create',
      payload: {
        name: `OpenClaw: ${input.request.operation}`,
        proposedActionType: proposed,
        targetType,
        targetKey: input.request.targetKey ?? null,
        reason: input.request.reason,
        expectedChange: input.request.expectedChange,
        risk: input.request.risk,
        reversible: input.request.reversible,
        payload: businessPayload,
      },
      idempotencyKey: input.request.idempotencyKey,
      confirmation: { mode: 'explicit', acknowledged: true, phrase: null },
      expectedPrevious: null,
      context: { source: 'openclaw', targetDate: null },
    }),
    {
      writesEnabled: true,
      idempotency: runtime.idempotency,
      audit: runtime.audit,
      handlers: { ...runtime.handlers, source: 'openclaw' },
      coordination: runtime.coordination ?? undefined,
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
  const stored = proposalKey ? await runtime.handlers.proposals.get(proposalKey) : null;

  return {
    ok: true,
    proposalKey,
    replay: result.code === 'idempotent-replay',
    summary: result.summary,
    risk: stored?.risk ?? input.request.risk,
    expiresAt: stored?.expiresAt ?? null,
    diff: sanitizeOpenClawProposalDiff(stored?.diff ?? null),
    result,
  };
}

export async function getOpenClawProposal(
  key: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  runtimeOverrides?: RuntimeOverrides,
): Promise<ActionProposalSummary | null> {
  if (!isOpenClawProposalsEnabled(env)) return null;
  const runtime = buildWriteRuntime(env, runtimeOverrides);
  return runtime.handlers.proposals.get(key);
}
