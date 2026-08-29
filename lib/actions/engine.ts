/**
 * Flujo común de escritura segura (reserva → intention → write → finalize).
 */
import { recordActionAudit, type AuditSink } from '@/lib/actions/audit';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import type { WriteCoordinationPort } from '@/lib/actions/coordination';
import { handleAllowedAction, type HandlerDeps } from '@/lib/actions/handlers';
import type { IdempotencyStore } from '@/lib/actions/idempotency';
import { idempotencyDigestFromActorHash, payloadDigestFromPlaintext } from '@/lib/actions/opaque';
import { evaluateActionPolicy, isForbiddenActionType } from '@/lib/actions/policy';
import {
  applyAuditPendingIfNeeded,
  recordSagaFinalize,
  recordSagaIntention,
} from '@/lib/actions/saga';
import type { ActionConfirmation, ActionRequest, ActionResult } from '@/types/actions';

export type ExecuteActionDeps = {
  writesEnabled?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  idempotency: IdempotencyStore;
  audit: AuditSink;
  handlers: HandlerDeps;
  coordination?: WriteCoordinationPort;
};

async function auditSafe(
  deps: ExecuteActionDeps,
  input: {
    actionType: string;
    actorHash: string;
    actorHint: string;
    result: ActionResult;
    confirmationMode: ActionConfirmation['mode'] | 'none';
  },
): Promise<ActionResult> {
  const digest = idempotencyDigestFromActorHash(
    input.actorHash,
    input.actionType,
    input.result.idempotencyKey,
  );
  const audited = await recordActionAudit(deps.audit, {
    actionType: input.actionType,
    actorHint: input.actorHint,
    result: input.result,
    confirmationMode: input.confirmationMode,
    idempotencyDigest: digest,
    afterSummary: input.result.summary,
  });
  if (input.result.ok && !audited.ok) {
    return applyAuditPendingIfNeeded(input.result, false);
  }
  return input.result;
}

export async function executeAction(
  request: ActionRequest,
  deps: ExecuteActionDeps,
): Promise<ActionResult> {
  const writesEnabled = deps.writesEnabled ?? isWriteActionsEnabled(deps.env ?? process.env);
  const confirmation: ActionConfirmation | null = request.confirmation ?? null;
  const actorHash = request.actorHash?.trim() ?? '';
  const actorHint = request.actorHint?.trim() || 'user';

  if (isForbiddenActionType(request.actionType)) {
    const denied: ActionResult = {
      ok: false,
      code: 'policy-denied',
      message: `La acción "${request.actionType}" está prohibida.`,
      idempotencyKey: request.idempotencyKey,
      actionType: 'forbidden',
      target: null,
      summary: null,
      verified: null,
    };
    await auditSafe(deps, {
      actionType: request.actionType,
      actorHash: actorHash || 'anonymous',
      actorHint,
      result: denied,
      confirmationMode: confirmation?.mode ?? 'none',
    });
    return denied;
  }

  const policy = evaluateActionPolicy({
    actionType: request.actionType,
    writesEnabled,
    authenticated: Boolean(actorHash),
    confirmation,
  });

  if (!policy.ok) {
    const mapped: ActionResult = {
      ok: false,
      code:
        policy.code === 'flag-disabled'
          ? 'flag-disabled'
          : policy.code === 'unauthenticated'
            ? 'unauthorized'
            : policy.code === 'confirmation-missing' || policy.code === 'confirmation-insufficient'
              ? 'policy-denied'
              : 'policy-denied',
      message: policy.message,
      idempotencyKey: request.idempotencyKey,
      actionType: request.actionType,
      target: null,
      summary: null,
      verified: null,
    };
    await auditSafe(deps, {
      actionType: request.actionType,
      actorHash: actorHash || 'anonymous',
      actorHint,
      result: mapped,
      confirmationMode: confirmation?.mode ?? 'none',
    });
    return mapped;
  }

  if (!request.idempotencyKey?.trim()) {
    return {
      ok: false,
      code: 'invalid-payload',
      message: 'Clave de idempotencia requerida.',
      idempotencyKey: request.idempotencyKey ?? '',
      actionType: request.actionType,
      target: null,
      summary: null,
      verified: null,
    };
  }

  const payloadDigest = payloadDigestFromPlaintext(
    typeof request.payload === 'string' ? request.payload : JSON.stringify(request.payload ?? null),
  );
  const digest = idempotencyDigestFromActorHash(
    actorHash,
    request.actionType,
    request.idempotencyKey,
  );

  const coordination = deps.coordination ?? deps.handlers.coordination;
  if (coordination) {
    const reserved = await coordination.reserveIdempotency({
      actorHash,
      actionType: request.actionType,
      idempotencyKey: request.idempotencyKey,
      payloadDigest,
      ttlSeconds: 86_400,
    });
    if (reserved.status === 'replay') {
      const replay: ActionResult = {
        ...reserved.result,
        code: 'idempotent-replay',
        message: reserved.result.ok
          ? 'Resultado idempotente reutilizado.'
          : reserved.result.message,
      };
      await auditSafe(deps, {
        actionType: request.actionType,
        actorHash,
        actorHint,
        result: replay,
        confirmationMode: confirmation?.mode ?? 'none',
      });
      return replay;
    }
    if (reserved.status === 'conflict') {
      const conflict: ActionResult = {
        ok: false,
        code: reserved.reason === 'in-progress' ? 'in-progress' : 'conflict',
        message:
          reserved.reason === 'digest-mismatch'
            ? 'Conflicto de idempotencia: digest distinto.'
            : reserved.reason === 'in-progress'
              ? 'Operación en progreso.'
              : 'Conflicto de idempotencia.',
        idempotencyKey: request.idempotencyKey,
        actionType: request.actionType,
        target: null,
        summary: null,
        verified: null,
      };
      await auditSafe(deps, {
        actionType: request.actionType,
        actorHash,
        actorHint,
        result: conflict,
        confirmationMode: confirmation?.mode ?? 'none',
      });
      return conflict;
    }
  } else {
    const cached = await deps.idempotency.get(
      actorHash,
      request.actionType,
      request.idempotencyKey,
    );
    if (cached) {
      const replay: ActionResult = {
        ...cached,
        code: 'idempotent-replay',
        message: cached.ok ? 'Resultado idempotente reutilizado.' : cached.message,
      };
      await auditSafe(deps, {
        actionType: request.actionType,
        actorHash,
        actorHint,
        result: replay,
        confirmationMode: confirmation?.mode ?? 'none',
      });
      return replay;
    }
  }

  const intentionPlaceholder: ActionResult = {
    ok: true,
    code: 'in-progress',
    message: 'Intención',
    idempotencyKey: request.idempotencyKey,
    actionType: request.actionType,
    target: null,
    summary: null,
    verified: null,
  };
  await recordSagaIntention(deps.audit, {
    actionType: request.actionType,
    actorHint,
    result: intentionPlaceholder,
    confirmationMode: confirmation?.mode ?? 'none',
    idempotencyDigest: digest,
  });

  const handled = await handleAllowedAction({
    actionType: policy.actionType,
    payload: request.payload,
    expectedPrevious: request.expectedPrevious,
    idempotencyKey: request.idempotencyKey,
    deps: deps.handlers,
  });

  if (coordination) {
    await coordination.markFinal({
      actorHash,
      actionType: request.actionType,
      idempotencyKey: request.idempotencyKey,
      payloadDigest,
      result: handled,
      ttlSeconds: 86_400,
    });
  } else {
    await deps.idempotency.set(actorHash, request.actionType, request.idempotencyKey, handled);
  }

  const finalized = await recordSagaFinalize(deps.audit, {
    actionType: request.actionType,
    actorHint,
    result: handled,
    confirmationMode: confirmation?.mode ?? 'none',
    idempotencyDigest: digest,
    afterSummary: handled.summary,
  });

  return applyAuditPendingIfNeeded(handled, finalized.ok);
}
