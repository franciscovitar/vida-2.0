import { createHash } from 'node:crypto';

import { applyAuditPendingIfNeeded } from '@/lib/actions/saga';
import {
  getWriteApprovalTtlSeconds,
  getWriteContractVersion,
  getWriteRollbackWindowSeconds,
} from '@/lib/actions/config';
import { digestFromDiff } from '@/lib/actions/diff';
import { compensateBusiness, executeBusinessAction } from '@/lib/actions/handlers';
import { idempotencyDigestFromActorHash, opaqueKey, payloadDigestFromPlaintext } from '@/lib/actions/opaque';
import { validateInboxCapture } from '@/lib/actions/payloads';
import { getAllowedActionMeta } from '@/lib/actions/policy';
import { preflightBusinessProposal } from '@/lib/actions/preflight';
import { buildWriteRuntime, type WriteRuntimeBundle } from '@/lib/actions/runtime';
import { recordSagaFinalize, recordSagaIntention } from '@/lib/actions/saga';
import { isVidaConversationalDirectApplyEnabled } from '@/lib/capture/contracts';
import type {
  ActionDiff,
  ActionResult,
  ActionResultCode,
  InboxCapturePayload,
  ProposalCreatePayload,
} from '@/types/actions';

export type ConversationalInboxWriteIntent = 'explicit-write' | 'not-explicit';

export type ConversationalInboxDirectInput = {
  channel: 'chatgpt' | 'telegram' | 'whatsapp' | 'other';
  /** Trusted transport identity. Never derive from model/user body. */
  principalId: string;
  /** Stable transport event/message identity. Never derive from message contents. */
  sourceEventId: string;
  userIntent: ConversationalInboxWriteIntent;
  text: string;
  link?: string | null;
};

export type ConversationalInboxDirectResult = {
  ok: boolean;
  code: ActionResultCode;
  message: string;
  replay: boolean;
  verified: boolean | null;
};

type RuntimeOverrides = NonNullable<Parameters<typeof buildWriteRuntime>[1]>;

export type ConversationalInboxDirectOptions = {
  env?: Readonly<Record<string, string | undefined>>;
  runtime?: WriteRuntimeBundle;
  runtimeOverrides?: RuntimeOverrides;
  now?: () => string;
};

const SAFE_TRANSPORT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SOURCE = 'conversation-direct:chatgpt';
const ACTION = 'inbox.capture' as const;

function fail(
  code: ActionResultCode,
  message: string,
  verified: boolean | null = false,
): ConversationalInboxDirectResult {
  return { ok: false, code, message, replay: false, verified };
}

function sanitizedResult(result: ActionResult, replay = false): ConversationalInboxDirectResult {
  if (result.ok) {
    return {
      ok: true,
      code: replay ? 'idempotent-replay' : result.code,
      message: 'Guardado en Bandeja.',
      replay,
      verified: result.verified,
    };
  }
  return {
    ok: false,
    code: result.code,
    message:
      result.code === 'conflict' || result.code === 'in-progress'
        ? 'La captura ya está siendo procesada o el evento no coincide.'
        : 'No se pudo guardar en Bandeja.',
    replay,
    verified: result.verified,
  };
}

function actorHashFromTrustedPrincipal(principalId: string): string {
  return createHash('sha256')
    .update(`vida2-conversation-actor:chatgpt:${principalId}`)
    .digest('hex')
    .slice(0, 32);
}

function directLedgerDiff(payload: InboxCapturePayload): ActionDiff {
  return {
    fields: [
      { field: 'contentPresent', before: null, after: true },
      { field: 'origin', before: null, after: payload.origin },
      { field: 'hasLink', before: null, after: Boolean(payload.link) },
    ],
  };
}

function internalResult(input: {
  ok: boolean;
  code: ActionResultCode;
  message: string;
  idempotencyKey: string;
  targetKey?: string | null;
  verified?: boolean | null;
}): ActionResult {
  return {
    ok: input.ok,
    code: input.code,
    message: input.message,
    idempotencyKey: input.idempotencyKey,
    actionType: ACTION,
    target: input.targetKey === undefined ? null : { type: 'inbox', key: input.targetKey },
    summary: input.ok ? 'Captura conversacional registrada.' : null,
    verified: input.verified ?? (input.ok ? true : false),
  };
}

async function markFinalSafe(
  runtime: WriteRuntimeBundle,
  input: {
    actorHash: string;
    idempotencyKey: string;
    payloadDigest: string;
    result: ActionResult;
  },
): Promise<void> {
  if (!runtime.coordination) return;
  try {
    await runtime.coordination.markFinal({
      actorHash: input.actorHash,
      actionType: ACTION,
      idempotencyKey: input.idempotencyKey,
      payloadDigest: input.payloadDigest,
      result: input.result,
      ttlSeconds: 86_400,
    });
  } catch {
    // Ledger remains the durable replay guard. Never re-run the business write here.
  }
}

async function finalizeAuditSafe(
  runtime: WriteRuntimeBundle,
  input: {
    actorHash: string;
    actorHint: string;
    idempotencyKey: string;
    result: ActionResult;
    beforeSummary: string | null;
  },
): Promise<ActionResult> {
  const digest = idempotencyDigestFromActorHash(input.actorHash, ACTION, input.idempotencyKey);
  const audited = await recordSagaFinalize(runtime.audit, {
    actionType: ACTION,
    actorHint: input.actorHint,
    result: input.result,
    confirmationMode: 'explicit',
    idempotencyDigest: digest,
    beforeSummary: input.beforeSummary,
    afterSummary: input.result.summary,
  });
  return applyAuditPendingIfNeeded(input.result, audited.ok);
}

export async function executeConversationalInboxDirectApply(
  input: ConversationalInboxDirectInput,
  options: ConversationalInboxDirectOptions = {},
): Promise<ConversationalInboxDirectResult> {
  const env = options.env ?? process.env;

  if (input.channel !== 'chatgpt') {
    return fail('policy-denied', 'Este canal todavía no está habilitado para captura directa.', null);
  }
  if (input.userIntent !== 'explicit-write') {
    return fail('policy-denied', 'Hace falta una intención explícita de guardar.', null);
  }
  if (!SAFE_TRANSPORT_ID.test(input.principalId) || !SAFE_TRANSPORT_ID.test(input.sourceEventId)) {
    return fail('invalid-payload', 'Identidad de transporte inválida.', null);
  }
  if (!isVidaConversationalDirectApplyEnabled(ACTION, env)) {
    return fail('flag-disabled', 'La captura conversacional directa está desactivada.', null);
  }

  const now = options.now?.() ?? new Date().toISOString();
  const parsed = validateInboxCapture({
    text: input.text,
    link: input.link ?? null,
    capturedAt: now,
    origin: 'chatgpt',
  });
  if (!parsed.ok) {
    return fail('invalid-payload', 'La captura no cumple el contrato permitido.', null);
  }

  const runtime =
    options.runtime ?? buildWriteRuntime(env, { ...options.runtimeOverrides, now: options.now });
  if ((runtime.mode !== 'real' && runtime.mode !== 'memory-test') || !runtime.coordination) {
    return fail('misconfigured', 'El runtime seguro de escrituras no está disponible.', null);
  }
  if (
    runtime.status.components.notionInbox !== 'ready' ||
    runtime.status.components.proposalsLedger !== 'ready' ||
    runtime.status.components.audit !== 'ready' ||
    runtime.status.components.rollback !== 'ready'
  ) {
    return fail('misconfigured', 'La captura segura no está operativa.', null);
  }

  const preflight = await preflightBusinessProposal(ACTION, parsed.value, runtime.handlers);
  if (!preflight.ok) {
    return fail(
      preflight.code === 'invalid-payload' ? 'invalid-payload' : 'not-configured',
      'La Bandeja no está disponible para esta captura.',
      null,
    );
  }

  const actorHash = actorHashFromTrustedPrincipal(input.principalId);
  const actorHint = `conversation:${actorHash.slice(0, 8)}`;
  const idempotencyKey = `conversation:chatgpt:${input.sourceEventId}`;
  const payloadDigest = payloadDigestFromPlaintext(JSON.stringify(parsed.value));
  const ledgerKey = opaqueKey('prop', `${SOURCE}:${actorHash}:${input.sourceEventId}`);
  const ledgerDiff = directLedgerDiff(parsed.value);
  const beforeDigest = digestFromDiff({ fields: [] });

  const existing = await runtime.handlers.proposals.get(ledgerKey);
  if (existing) {
    if (existing.payloadDigest !== payloadDigest) {
      return fail('conflict', 'El mismo evento no puede representar otra captura.', false);
    }
    if (existing.status === 'applied') {
      return {
        ok: true,
        code: 'idempotent-replay',
        message: 'Guardado en Bandeja.',
        replay: true,
        verified: true,
      };
    }
    return fail(
      existing.status === 'executing' || existing.status === 'pending' ? 'in-progress' : 'conflict',
      'Este evento ya fue procesado y no se volverá a ejecutar.',
      false,
    );
  }

  const reserved = await runtime.coordination.reserveIdempotency({
    actorHash,
    actionType: ACTION,
    idempotencyKey,
    payloadDigest,
    ttlSeconds: 86_400,
  });
  if (reserved.status === 'replay') {
    return sanitizedResult(reserved.result, true);
  }
  if (reserved.status === 'conflict') {
    return fail(
      reserved.reason === 'in-progress' ? 'in-progress' : 'conflict',
      'La captura ya está siendo procesada o el evento no coincide.',
      false,
    );
  }

  const intention = internalResult({
    ok: true,
    code: 'in-progress',
    message: 'Intención conversacional explícita.',
    idempotencyKey,
    verified: null,
  });
  const intentionAudit = await recordSagaIntention(runtime.audit, {
    actionType: ACTION,
    actorHint,
    result: intention,
    confirmationMode: 'explicit',
    idempotencyDigest: idempotencyDigestFromActorHash(actorHash, ACTION, idempotencyKey),
    beforeSummary: beforeDigest,
  });
  if (!intentionAudit.ok) {
    const stopped = internalResult({
      ok: false,
      code: 'failed',
      message: 'Auditoría de intención no disponible.',
      idempotencyKey,
      verified: false,
    });
    await markFinalSafe(runtime, { actorHash, idempotencyKey, payloadDigest, result: stopped });
    return sanitizedResult(stopped);
  }

  const policy = getAllowedActionMeta(ACTION);
  const placeholderPayload: InboxCapturePayload = {
    text: '[direct-capture-redacted]',
    link: null,
    capturedAt: now,
    origin: 'chatgpt',
  };
  const proposalPayload: ProposalCreatePayload = {
    name: 'ChatGPT: inbox.capture',
    proposedActionType: ACTION,
    targetType: 'inbox',
    targetKey: null,
    reason: 'Captura conversacional explícita.',
    expectedChange: 'Agregar una entrada a Bandeja.',
    risk: policy.risk,
    reversible: policy.reversible,
    payload: placeholderPayload,
  };

  let ledgerCreated;
  try {
    ledgerCreated = await runtime.handlers.proposals.create(proposalPayload, {
      key: ledgerKey,
      idempotencyKey,
      createdAt: now,
      expiresAt: new Date(Date.parse(now) + getWriteApprovalTtlSeconds(env) * 1000).toISOString(),
      payloadDigest,
      contractVersion: getWriteContractVersion(env),
      source: SOURCE,
      beforeDigest,
      diff: ledgerDiff,
      encryptedPayloadKey: null,
      confirmationMode: 'explicit',
    });
  } catch {
    const failed = internalResult({
      ok: false,
      code: 'failed',
      message: 'No se pudo reservar el ledger de captura.',
      idempotencyKey,
      verified: false,
    });
    await markFinalSafe(runtime, { actorHash, idempotencyKey, payloadDigest, result: failed });
    return sanitizedResult(failed);
  }

  const executing = await runtime.handlers.proposals.updateStatus(
    ledgerCreated.key,
    'executing',
    {
      decidedAt: now,
      executionStartedAt: now,
      resultCode: 'executing',
    },
    { expectedStatus: 'pending' },
  );
  if (!executing) {
    const failed = internalResult({
      ok: false,
      code: 'conflict',
      message: 'No se pudo iniciar la transacción de captura.',
      idempotencyKey,
      verified: false,
    });
    await markFinalSafe(runtime, { actorHash, idempotencyKey, payloadDigest, result: failed });
    await finalizeAuditSafe(runtime, {
      actorHash,
      actorHint,
      idempotencyKey,
      result: failed,
      beforeSummary: beforeDigest,
    });
    return sanitizedResult(failed);
  }

  const executed = await executeBusinessAction({
    actionType: ACTION,
    payload: parsed.value,
    expectedPrevious: null,
    idempotencyKey: `${idempotencyKey}:exec`,
    deps: { ...runtime.handlers, source: SOURCE, now: options.now },
  });

  if (!executed.result.ok) {
    await runtime.handlers.proposals.updateStatus(
      ledgerCreated.key,
      'failed',
      {
        resultCode: executed.result.code,
        afterSummary: 'La captura no fue aplicada.',
        targetKey: executed.result.target?.key ?? null,
      },
      { expectedStatus: 'executing' },
    );
    const finalFailure = internalResult({
      ok: false,
      code: executed.result.code,
      message: 'La captura no fue aplicada.',
      idempotencyKey,
      targetKey: executed.result.target?.key,
      verified: executed.result.verified,
    });
    await markFinalSafe(runtime, {
      actorHash,
      idempotencyKey,
      payloadDigest,
      result: finalFailure,
    });
    const audited = await finalizeAuditSafe(runtime, {
      actorHash,
      actorHint,
      idempotencyKey,
      result: finalFailure,
      beforeSummary: beforeDigest,
    });
    return sanitizedResult(audited);
  }

  const targetKey = executed.result.target?.key ?? null;
  const rollbackDeadline =
    executed.reversible && targetKey && executed.ownership
      ? new Date(Date.parse(now) + getWriteRollbackWindowSeconds(env) * 1000).toISOString()
      : null;
  const applied = await runtime.handlers.proposals.updateStatus(
    ledgerCreated.key,
    'applied',
    {
      appliedAt: now,
      resultCode: 'applied',
      beforeSummary: beforeDigest,
      afterSummary: 'Captura conversacional registrada.',
      beforeDigest,
      diff: ledgerDiff,
      targetKey,
      rollbackDeadline,
      ownershipDigest: executed.ownership,
      encryptedPayloadKey: null,
    },
    { expectedStatus: 'executing' },
  );

  if (!applied) {
    const compensated = await compensateBusiness({
      actionType: ACTION,
      targetKey,
      ownership: executed.ownership,
      deps: runtime.handlers,
      diff: ledgerDiff,
    });
    if (compensated.ok) {
      await runtime.handlers.proposals.updateStatus(
        ledgerCreated.key,
        'failed',
        {
          resultCode: 'failed',
          afterSummary: 'Captura compensada por fallo de ledger.',
          targetKey,
          ownershipDigest: executed.ownership,
        },
        { expectedStatus: 'executing' },
      );
      const failed = internalResult({
        ok: false,
        code: 'failed',
        message: 'La captura fue compensada porque no pudo certificarse el ledger.',
        idempotencyKey,
        targetKey,
        verified: true,
      });
      await markFinalSafe(runtime, { actorHash, idempotencyKey, payloadDigest, result: failed });
      const audited = await finalizeAuditSafe(runtime, {
        actorHash,
        actorHint,
        idempotencyKey,
        result: failed,
        beforeSummary: beforeDigest,
      });
      return sanitizedResult(audited);
    }

    const partial = internalResult({
      ok: false,
      code: 'partial',
      message: 'La captura requiere revisión manual y no se reintentará automáticamente.',
      idempotencyKey,
      targetKey,
      verified: false,
    });
    await markFinalSafe(runtime, { actorHash, idempotencyKey, payloadDigest, result: partial });
    await finalizeAuditSafe(runtime, {
      actorHash,
      actorHint,
      idempotencyKey,
      result: partial,
      beforeSummary: beforeDigest,
    });
    return {
      ok: false,
      code: 'partial',
      message: 'La captura requiere revisión y no se reintentará automáticamente.',
      replay: false,
      verified: false,
    };
  }

  const success = internalResult({
    ok: true,
    code: 'applied',
    message: 'Captura conversacional aplicada.',
    idempotencyKey,
    targetKey,
    verified: true,
  });
  await markFinalSafe(runtime, { actorHash, idempotencyKey, payloadDigest, result: success });
  const audited = await finalizeAuditSafe(runtime, {
    actorHash,
    actorHint,
    idempotencyKey,
    result: success,
    beforeSummary: beforeDigest,
  });
  return sanitizedResult(audited);
}
