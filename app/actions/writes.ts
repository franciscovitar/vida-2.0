'use server';

import { verifySession } from '@/lib/auth/dal';
import { sanitizeActorHint } from '@/lib/actions/audit';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { executeAction } from '@/lib/actions/engine';
import {
  buildWriteOperabilityMatrix,
  type WriteOperabilityMatrix,
} from '@/lib/actions/operability';
import { actorHashFromEmail } from '@/lib/actions/opaque';
import { isPublicControlAction } from '@/lib/actions/policy';
import { buildWriteRuntime, getWriteRuntimeStatus } from '@/lib/actions/runtime';
import type {
  ActionDiff,
  ActionProposalSummary,
  ActionRequest,
  ActionResult,
} from '@/types/actions';

function ensureOperationId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : crypto.randomUUID();
}

function policyDenied(actionType: string, operationId: string, message: string): ActionResult {
  return {
    ok: false,
    code: 'policy-denied',
    message,
    idempotencyKey: operationId,
    actionType: (isPublicControlAction(actionType)
      ? actionType
      : 'forbidden') as ActionResult['actionType'],
    target: null,
    summary: null,
    verified: null,
  };
}

/** Resumen sanitizado para el cliente (sin ciphertext, digests internos ni ownership). */
export type ClientProposalSummary = Omit<
  ActionProposalSummary,
  'encryptedPayloadKey' | 'ownershipDigest' | 'payloadDigest' | 'beforeDigest'
> & {
  diff: ActionDiff | null;
};

function toClientProposal(proposal: ActionProposalSummary): ClientProposalSummary {
  const { encryptedPayloadKey, ownershipDigest, payloadDigest, beforeDigest, ...safe } = proposal;
  void encryptedPayloadKey;
  void ownershipDigest;
  void payloadDigest;
  void beforeDigest;
  return {
    ...safe,
    diff: proposal.diff
      ? {
          fields: proposal.diff.fields.map((field) => ({
            field: field.field,
            before: field.before,
            after: field.after,
          })),
          warnings: proposal.diff.warnings ? [...proposal.diff.warnings] : undefined,
        }
      : null,
  };
}

/**
 * Única puerta Server Action de escrituras 8E / Block 3.
 * Solo PUBLIC_CONTROL_ACTIONS; negocio vía proposal.create.
 * No expone métodos destructivos ni email en ActionRequest.
 */
export async function runWriteAction(input: {
  actionType: string;
  payload: unknown;
  idempotencyKey?: string;
  confirmation: ActionRequest['confirmation'];
  expectedPrevious?: string | null;
  targetDate?: string | null;
}): Promise<ActionResult> {
  const operationId = ensureOperationId(input.idempotencyKey);
  const session = await verifySession();
  if (!session.ok) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'Tenés que iniciar sesión para ejecutar acciones.',
      idempotencyKey: operationId,
      actionType: 'forbidden',
      target: null,
      summary: null,
      verified: null,
    };
  }

  if (!isWriteActionsEnabled()) {
    return {
      ok: false,
      code: 'flag-disabled',
      message: 'Las escrituras están desactivadas.',
      idempotencyKey: operationId,
      actionType: input.actionType as ActionResult['actionType'],
      target: null,
      summary: null,
      verified: null,
    };
  }

  if (!isPublicControlAction(input.actionType)) {
    return policyDenied(
      input.actionType,
      operationId,
      'Solo se permiten proposal.create, proposal.approve, proposal.reject y action.rollback desde la web.',
    );
  }

  const actorHash = actorHashFromEmail(session.email);
  const actorHint = sanitizeActorHint(session.email);

  const runtime = buildWriteRuntime();

  const request: ActionRequest = {
    actionType: input.actionType,
    payload: input.payload,
    idempotencyKey: operationId,
    confirmation: input.confirmation,
    expectedPrevious: input.expectedPrevious ?? null,
    actorHash,
    actorHint,
    context: { source: 'web', targetDate: input.targetDate ?? null },
  };

  return executeAction(request, {
    writesEnabled: true,
    idempotency: runtime.idempotency,
    audit: runtime.audit,
    handlers: runtime.handlers,
    coordination: runtime.coordination ?? undefined,
  });
}

export async function loadApprovalsBoard(): Promise<{
  writesEnabled: boolean;
  proposals: readonly ClientProposalSummary[];
}> {
  const session = await verifySession();
  if (!session.ok) {
    return { writesEnabled: false, proposals: [] };
  }
  const writesEnabled = isWriteActionsEnabled();
  if (!writesEnabled) {
    return { writesEnabled: false, proposals: [] };
  }
  const runtime = buildWriteRuntime();
  const proposals = await runtime.handlers.proposals.list();
  return { writesEnabled: true, proposals: proposals.map(toClientProposal) };
}

export async function getWritesEnabledFlag(): Promise<boolean> {
  const session = await verifySession();
  if (!session.ok) return false;
  return isWriteActionsEnabled();
}

/** Estado sanitizado para Ajustes / preflight (sin secretos). */
export async function loadWriteRuntimeStatus() {
  const session = await verifySession();
  if (!session.ok) {
    return null;
  }
  return getWriteRuntimeStatus();
}

/** Matriz de operabilidad read-only (sin body del cliente, sin acciones). */
export async function loadWriteOperabilityMatrix(): Promise<WriteOperabilityMatrix | null> {
  const session = await verifySession();
  if (!session.ok) return null;
  // Con flag off: buildWriteOperabilityMatrix no hace I/O ni construye clientes.
  if (!isWriteActionsEnabled()) {
    return buildWriteOperabilityMatrix({
      tasks: {
        createTask: async () => ({ ok: false, code: 'not-configured', message: 'off' }),
        getTask: async () => null,
        updateTaskStatus: async () => ({ ok: false, code: 'not-configured', message: 'off' }),
        resolveAreaProjectCompatibility: async () => ({ ok: false, message: 'off' }),
        checkReady: async () => ({ ok: false, code: 'not-configured', message: 'off' }),
        archiveOwnedTask: async () => ({ ok: false, code: 'not-configured', message: 'off' }),
      },
      inbox: {
        appendCapture: async () => ({
          ok: false,
          code: 'not-configured',
          message: 'off',
          preserveText: true as const,
        }),
        archiveCapture: async () => ({ ok: false, code: 'not-configured', message: 'off' }),
        verifyCapture: async () => ({ ok: false, message: 'off' }),
        checkReady: async () => ({ ok: false, code: 'not-configured', message: 'off' }),
      },
      gym: {
        createPendingSession: async () => ({ ok: false, message: 'off' }),
        writeSets: async () => ({ ok: false, written: 0, message: 'off' }),
        verifySession: async () => ({ ok: false, message: 'off' }),
        setSessionStatus: async () => ({ ok: false, message: 'off' }),
        markReverted: async () => ({ ok: false, message: 'off' }),
        checkReady: async () => ({ ok: false, code: 'not-configured', message: 'off' }),
      },
    });
  }
  const runtime = buildWriteRuntime();
  return buildWriteOperabilityMatrix(runtime.handlers);
}
