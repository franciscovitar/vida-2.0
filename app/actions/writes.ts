'use server';

import { verifySession } from '@/lib/auth/dal';
import { processAuditSink } from '@/lib/actions/audit';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { executeAction } from '@/lib/actions/engine';
import { processIdempotencyStore } from '@/lib/actions/idempotency';
import { buildHandlerDeps, listProcessProposals } from '@/lib/actions/runtime';
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
      idempotency: processIdempotencyStore,
      audit: processAuditSink,
      handlers: buildHandlerDeps(),
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
  const proposals = await listProcessProposals();
  return { writesEnabled: true, proposals };
}

export async function getWritesEnabledFlag(): Promise<boolean> {
  const session = await verifySession();
  if (!session.ok) return false;
  return isWriteActionsEnabled();
}
