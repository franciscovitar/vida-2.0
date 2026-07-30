/**
 * Creación de propuestas vía motor Block 3 (sin escrituras finales ni approve).
 */
import { isOpenClawProposalsEnabled } from '@/lib/actions/config';
import { executeAction } from '@/lib/actions/engine';
import {
  validateCalendarHoldCreate,
  validateGymSessionCreate,
  validateInboxCapture,
  validateTaskChangeStatus,
  validateTaskCreate,
} from '@/lib/actions/payloads';
import { getAllowedActionMeta } from '@/lib/actions/policy';
import { requestFromOpenClawAgentId } from '@/lib/actions/request';
import { buildWriteRuntime } from '@/lib/actions/runtime';
import { isOpenClawProposalAllowed, openClawAgentSource } from '@/lib/openclaw/agents';
import type {
  OpenClawAgentId,
  OpenClawApprovalsListInput,
  OpenClawProposalDiff,
  OpenClawProposalStatus,
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

const PROPOSAL_BODY_KEYS = new Set([
  'operation',
  'idempotencyKey',
  'reason',
  'expectedChange',
  'risk',
  'reversible',
  'payload',
  'targetKey',
]);

const ACTOR_BODY_KEYS = new Set(['actor', 'actorId', 'actorHash', 'actorHint', 'email', 'user']);

const CALENDAR_BLOCK_LEGACY_KEYS = new Set([
  'title',
  'date',
  'startTime',
  'endTime',
  'reason',
  'relatedTaskKey',
]);

export function isOpenClawProposeOperation(value: string): value is OpenClawProposeOperation {
  return value in PROPOSE_TO_ACTION;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rejectUnknownKeys(
  data: Record<string, unknown>,
  allowlist: ReadonlySet<string>,
): string | null {
  for (const key of Object.keys(data)) {
    if (!allowlist.has(key)) {
      return `Campo no permitido: ${key}.`;
    }
  }
  return null;
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

/** Fuerza origin canónico de OpenClaw antes de validar el contrato de bandeja. */
function buildInboxCapturePayload(
  raw: unknown,
): { ok: true; value: InboxCapturePayload } | { ok: false; message: string } {
  const record = asRecord(raw);
  if (!record) return { ok: false, message: 'payload requerido.' };
  return validateInboxCapture({
    ...record,
    origin: 'openclaw',
  });
}

function parseCalendarBlockProposePayload(
  raw: unknown,
): { ok: true; value: CalendarHoldCreatePayload } | { ok: false; message: string } {
  const record = asRecord(raw);
  if (!record) return { ok: false, message: 'payload requerido.' };
  const unknown = rejectUnknownKeys(record, CALENDAR_BLOCK_LEGACY_KEYS);
  if (unknown) return { ok: false, message: unknown };

  if (typeof record.title !== 'string') {
    return { ok: false, message: 'Título de hold inválido.' };
  }
  if (typeof record.date !== 'string') {
    return { ok: false, message: 'Bloque de Calendar inválido.' };
  }
  if (typeof record.startTime !== 'string' || typeof record.endTime !== 'string') {
    return { ok: false, message: 'Bloque de Calendar inválido.' };
  }
  if (record.reason !== undefined && record.reason !== null && typeof record.reason !== 'string') {
    return { ok: false, message: 'Nota no permitida.' };
  }
  if (
    record.relatedTaskKey !== undefined &&
    record.relatedTaskKey !== null &&
    typeof record.relatedTaskKey !== 'string'
  ) {
    return { ok: false, message: 'Campo no permitido: relatedTaskKey.' };
  }

  const title = record.title.trim();
  const date = record.date;
  const startTime = record.startTime.trim();
  const endTime = record.endTime.trim();
  if (
    !title ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime)
  ) {
    return { ok: false, message: 'Bloque de Calendar inválido.' };
  }

  return validateCalendarHoldCreate({
    title,
    start: `${date}T${startTime}:00.000Z`,
    end: `${date}T${endTime}:00.000Z`,
    note: typeof record.reason === 'string' ? record.reason : null,
    relatedTaskKey: typeof record.relatedTaskKey === 'string' ? record.relatedTaskKey : null,
  });
}

function parseOperationPayload(
  operation: OpenClawProposeOperation,
  raw: unknown,
): { ok: true; value: OpenClawProposalRequest['payload'] } | { ok: false; message: string } {
  switch (operation) {
    case 'task.create.propose':
      return validateTaskCreate(raw);
    case 'task.change-status.propose':
      return validateTaskChangeStatus(raw);
    case 'inbox.capture.propose':
      return buildInboxCapturePayload(raw);
    case 'gym.session.create.propose':
      return validateGymSessionCreate(raw);
    case 'calendar.hold.create.propose':
      return validateCalendarHoldCreate(raw);
    case 'calendar.block.propose':
      return parseCalendarBlockProposePayload(raw);
  }
}

export function parseOpenClawProposalRequest(
  body: unknown,
): { ok: true; value: OpenClawProposalRequest } | { ok: false; message: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, message: 'Body inválido.' };

  for (const key of Object.keys(record)) {
    if (!PROPOSAL_BODY_KEYS.has(key)) {
      if (ACTOR_BODY_KEYS.has(key)) {
        return { ok: false, message: 'Actor no permitido en el body.' };
      }
      if (key === 'actionType') {
        return { ok: false, message: 'actionType no permitido; use operation de propuesta.' };
      }
      return { ok: false, message: `Campo no permitido en el body: ${key}.` };
    }
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

  const policy = getAllowedActionMeta(PROPOSE_TO_ACTION[operation]);
  if (risk !== policy.risk) {
    return { ok: false, message: 'Riesgo incompatible con la política de la acción.' };
  }
  if (record.reversible !== policy.reversible) {
    return { ok: false, message: 'Reversibilidad incompatible con la política de la acción.' };
  }

  const targetKey =
    record.targetKey === undefined || record.targetKey === null
      ? null
      : typeof record.targetKey === 'string'
        ? record.targetKey
        : null;
  if (
    record.targetKey !== undefined &&
    record.targetKey !== null &&
    typeof record.targetKey !== 'string'
  ) {
    return { ok: false, message: 'targetKey inválido.' };
  }

  const parsedPayload = parseOperationPayload(operation, record.payload);
  if (!parsedPayload.ok) {
    return { ok: false, message: parsedPayload.message };
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
      payload: parsedPayload.value,
      targetKey,
    } as OpenClawProposalRequest,
  };
}

type RuntimeOverrides = NonNullable<Parameters<typeof buildWriteRuntime>[1]>;

export async function createOpenClawProposal(input: {
  agentId?: OpenClawAgentId;
  /** Compatibilidad de tests previos; se ignora como identidad. */
  keyId?: string;
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
  const legacyCaller = input.agentId === undefined;
  const agentId = input.agentId ?? 'steward';
  if (!isOpenClawProposalsEnabled(env)) {
    return {
      ok: false,
      code: 'flag-disabled',
      message: 'OpenClaw proposals desactivadas.',
    };
  }

  if (!legacyCaller && !isOpenClawProposalAllowed(agentId, input.request.operation)) {
    return {
      ok: false,
      code: 'policy-denied',
      message: 'Operación no permitida para este agente.',
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

  const businessPayload = input.request.payload;

  const source: 'openclaw' | `agent:${string}` = legacyCaller ? 'openclaw' : `agent:${agentId}`;
  const runtime = buildWriteRuntime(env, input.runtimeOverrides);
  const result = await executeAction(
    requestFromOpenClawAgentId(agentId, {
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
      context: { source, targetDate: null },
    }),
    {
      writesEnabled: true,
      idempotency: runtime.idempotency,
      audit: runtime.audit,
      handlers: { ...runtime.handlers, source },
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

export function isOpenClawProposalOwnedByAgent(
  proposal: Pick<ActionProposalSummary, 'source'>,
  agentId: OpenClawAgentId,
): boolean {
  const source = openClawAgentSource(agentId);
  // Migración segura: la fuente global histórica pertenece únicamente al Mayordomo.
  return proposal.source === source || (agentId === 'steward' && proposal.source === 'openclaw');
}

export function filterOpenClawOwnProposals(
  proposals: readonly ActionProposalSummary[],
  agentId: OpenClawAgentId,
  input: OpenClawApprovalsListInput = {},
): ActionProposalSummary[] {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  return proposals
    .filter((proposal) => isOpenClawProposalOwnedByAgent(proposal, agentId))
    .filter(
      (proposal) =>
        !input.status ||
        proposal.status ===
          (input.status as OpenClawProposalStatus | ActionProposalSummary['status']),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export async function listOpenClawOwnProposals(
  agentId: OpenClawAgentId,
  input: OpenClawApprovalsListInput,
  env: Readonly<Record<string, string | undefined>> = process.env,
  runtimeOverrides?: RuntimeOverrides,
): Promise<
  | { ok: true; proposals: ReturnType<typeof toOpenClawProposalMetadata>[] }
  | { ok: false; code: 'source-unavailable'; message: string }
> {
  if (!isOpenClawProposalsEnabled(env)) {
    return {
      ok: false,
      code: 'source-unavailable',
      message: 'Fuente de propuestas no disponible.',
    };
  }

  const runtime = buildWriteRuntime(env, runtimeOverrides);
  const rows = await runtime.handlers.proposals.list();
  const own = filterOpenClawOwnProposals(rows, agentId, input);
  return { ok: true, proposals: own.map(toOpenClawProposalMetadata) };
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
