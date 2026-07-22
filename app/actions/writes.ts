'use server';

import { verifySession } from '@/lib/auth/dal';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { executeAction } from '@/lib/actions/engine';
import { buildWriteRuntime, getWriteRuntimeStatus } from '@/lib/actions/runtime';
import type { ActionRequest, ActionResult, ActionProposalSummary } from '@/types/actions';

function ensureOperationId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : crypto.randomUUID();
}

/**
 * Única puerta Server Action de escrituras 8E.
 * No expone métodos destructivos.
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

  const runtime = buildWriteRuntime();

  return executeAction(
    {
      actionType: input.actionType as ActionRequest['actionType'],
      actorEmail: session.email,
      payload: input.payload,
      idempotencyKey: operationId,
      confirmation: input.confirmation,
      expectedPrevious: input.expectedPrevious ?? null,
      context: { source: 'web', targetDate: input.targetDate ?? null },
    },
    {
      writesEnabled: true,
      idempotency: runtime.idempotency,
      audit: runtime.audit,
      handlers: runtime.handlers,
    },
  );
}

export async function loadApprovalsBoard(): Promise<{
  writesEnabled: boolean;
  proposals: readonly ActionProposalSummary[];
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
  return { writesEnabled: true, proposals };
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
