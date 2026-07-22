/**
 * Flujo común de escritura segura.
 */
import { recordActionAudit, type AuditSink } from '@/lib/actions/audit';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { handleAllowedAction, type HandlerDeps } from '@/lib/actions/handlers';
import type { IdempotencyStore } from '@/lib/actions/idempotency';
import { evaluateActionPolicy, isForbiddenActionType } from '@/lib/actions/policy';
import type { ActionConfirmation, ActionRequest, ActionResult } from '@/types/actions';

export type ExecuteActionDeps = {
  writesEnabled?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
  idempotency: IdempotencyStore;
  audit: AuditSink;
  handlers: HandlerDeps;
};

export async function executeAction(
  request: ActionRequest,
  deps: ExecuteActionDeps,
): Promise<ActionResult> {
  const writesEnabled = deps.writesEnabled ?? isWriteActionsEnabled(deps.env ?? process.env);
  const confirmation: ActionConfirmation | null = request.confirmation ?? null;

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
    recordActionAudit(deps.audit, {
      actionType: request.actionType,
      actorEmail: request.actorEmail,
      result: denied,
      confirmationMode: confirmation?.mode ?? 'none',
    });
    return denied;
  }

  const policy = evaluateActionPolicy({
    actionType: request.actionType,
    writesEnabled,
    authenticated: Boolean(request.actorEmail?.trim()),
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
    recordActionAudit(deps.audit, {
      actionType: request.actionType,
      actorEmail: request.actorEmail,
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

  const cached = deps.idempotency.get(
    request.actorEmail,
    request.actionType,
    request.idempotencyKey,
  );
  if (cached) {
    const replay: ActionResult = {
      ...cached,
      code: 'idempotent-replay',
      message: cached.ok ? 'Resultado idempotente reutilizado.' : cached.message,
    };
    recordActionAudit(deps.audit, {
      actionType: request.actionType,
      actorEmail: request.actorEmail,
      result: replay,
      confirmationMode: confirmation?.mode ?? 'none',
    });
    return replay;
  }

  // Aprobar vuelve a pasar por Policy Engine (ya evaluado arriba con confirmation reinforced).
  const handled = await handleAllowedAction({
    actionType: policy.actionType,
    payload: request.payload,
    expectedPrevious: request.expectedPrevious,
    idempotencyKey: request.idempotencyKey,
    deps: deps.handlers,
  });

  deps.idempotency.set(request.actorEmail, request.actionType, request.idempotencyKey, handled);
  recordActionAudit(deps.audit, {
    actionType: request.actionType,
    actorEmail: request.actorEmail,
    result: handled,
    confirmationMode: confirmation?.mode ?? 'none',
  });
  return handled;
}
