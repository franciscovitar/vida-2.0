import { createHash } from 'node:crypto';

import { getAutomationWorkflowCredentials } from '@/lib/automations/credentials';
import {
  areAutomationTemplatesProvisioned,
  isAutomationsApiEnabled,
  isAutomationsManualRunEnabled,
  isAutomationsScheduleIngressEnabled,
  isAutomationWorkflowEnabled,
  isAutomationWorkflowPausedByConfig,
  resolveAutomationsAccessMode,
} from '@/lib/automations/config';
import {
  getAutomationPrincipalContract,
  getAutomationWorkflowContract,
  isAutomationPrincipalKey,
} from '@/lib/automations/contracts';
import {
  AutomationOrchestratorError,
  buildN8nClient,
  type AutomationOrchestratorClient,
} from '@/lib/automations/n8n-client';
import { buildAutomationLogEvent, emitAutomationLog } from '@/lib/automations/observability';
import {
  buildAutomationStateStore,
  createOpaqueAutomationKey,
  type AutomationStateStore,
} from '@/lib/automations/store';
import {
  AUTOMATION_CONTRACT_VERSION,
  AUTOMATION_RESULT_CODES,
  type AutomationArtifact,
  type AutomationPrincipalKey,
  type AutomationResultCode,
  type AutomationRunRecord,
  type AutomationRunStatus,
  type AutomationWorkflowControl,
  type AutomationWorkflowKey,
} from '@/types/automations';

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 15 * 60 * 1000;

export type AutomationStartResult = {
  ok: boolean;
  code:
    | 'accepted'
    | 'replay'
    | 'disabled'
    | 'misconfigured'
    | 'paused'
    | 'busy'
    | 'failed'
    | 'invalid-input';
  message: string;
  run: AutomationRunRecord | null;
};

export type AutomationResultInput = {
  runKey: string;
  workflowKey: AutomationWorkflowKey;
  principalKey: AutomationPrincipalKey;
  status: 'succeeded' | 'failed' | 'skipped' | 'cancelled';
  resultCode: AutomationResultCode;
  summary: string;
  proposalKey: string | null;
  artifact: {
    title: string;
    summary: string;
    items: readonly { label: string; value: string }[];
  } | null;
};

export type AutomationRuntime = ReturnType<typeof createAutomationRuntime>;

function defaultControl(
  workflowKey: AutomationWorkflowKey,
  nowIso: string,
): AutomationWorkflowControl {
  return {
    workflowKey,
    paused: false,
    circuit: { mode: 'closed', consecutiveFailures: 0, openedAt: null },
    updatedAt: nowIso,
  };
}

function finishRun(
  run: AutomationRunRecord,
  nowMs: number,
  status: AutomationRunStatus,
  code: AutomationResultCode,
  summary: string,
): AutomationRunRecord {
  const finishedAt = new Date(nowMs).toISOString();
  const start = run.startedAt ? Date.parse(run.startedAt) : nowMs;
  return {
    ...run,
    status,
    resultCode: code,
    summary,
    finishedAt,
    durationMs: Math.max(0, nowMs - start),
    updatedAt: finishedAt,
  };
}

function safeMessage(code: AutomationStartResult['code']): string {
  const messages: Record<AutomationStartResult['code'], string> = {
    accepted: 'La ejecución fue iniciada.',
    replay: 'La solicitud ya estaba registrada.',
    disabled: 'La automatización está desactivada.',
    misconfigured: 'La automatización todavía no está configurada.',
    paused: 'La automatización está pausada de forma segura.',
    busy: 'Ya hay una ejecución de este workflow en curso.',
    failed: 'El orquestador no pudo aceptar la ejecución.',
    'invalid-input': 'La solicitud no pertenece al contrato de automatizaciones.',
  };
  return messages[code];
}

export function createAutomationRuntime(deps: {
  store: AutomationStateStore;
  orchestrator?: AutomationOrchestratorClient;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (event: string) => void;
}) {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  async function controlFor(
    workflowKey: AutomationWorkflowKey,
  ): Promise<AutomationWorkflowControl> {
    return (
      (await deps.store.getWorkflowControl(workflowKey)) ??
      defaultControl(workflowKey, new Date(now()).toISOString())
    );
  }

  async function updateCircuit(workflowKey: AutomationWorkflowKey, failed: boolean): Promise<void> {
    const current = await controlFor(workflowKey);
    const failures = failed ? current.circuit.consecutiveFailures + 1 : 0;
    const opened = failed && failures >= CIRCUIT_FAILURE_THRESHOLD;
    await deps.store.putWorkflowControl({
      ...current,
      circuit: opened
        ? { mode: 'open', consecutiveFailures: failures, openedAt: new Date(now()).toISOString() }
        : { mode: 'closed', consecutiveFailures: failures, openedAt: null },
      updatedAt: new Date(now()).toISOString(),
    });
  }

  async function beginRun(input: {
    workflowKey: AutomationWorkflowKey;
    principalKey: AutomationPrincipalKey;
    trigger: 'scheduled' | 'manual';
    idempotencyKey: string;
    payloadDigest?: string;
    confirmed?: boolean;
  }): Promise<AutomationStartResult> {
    if (
      !isAutomationPrincipalKey(input.principalKey) ||
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 160 ||
      (input.payloadDigest !== undefined && !/^[0-9a-f]{64}$/.test(input.payloadDigest))
    )
      return {
        ok: false,
        code: 'invalid-input',
        message: safeMessage('invalid-input'),
        run: null,
      };

    const contract = getAutomationWorkflowContract(input.workflowKey);
    const principal = getAutomationPrincipalContract(input.principalKey);
    if (principal.workflowKey !== input.workflowKey)
      return {
        ok: false,
        code: 'invalid-input',
        message: safeMessage('invalid-input'),
        run: null,
      };
    if (!isAutomationsApiEnabled(env) || !isAutomationWorkflowEnabled(input.workflowKey, env))
      return { ok: false, code: 'disabled', message: safeMessage('disabled'), run: null };
    if (env.NODE_ENV !== 'test' && !areAutomationTemplatesProvisioned(env))
      return {
        ok: false,
        code: 'misconfigured',
        message: safeMessage('misconfigured'),
        run: null,
      };
    if (
      input.trigger === 'manual' &&
      (!isAutomationsManualRunEnabled(env) || input.confirmed !== true)
    )
      return { ok: false, code: 'disabled', message: safeMessage('disabled'), run: null };
    const mode = resolveAutomationsAccessMode(env);
    if (contract.outputKind === 'proposal' && mode !== 'proposal-only')
      return { ok: false, code: 'disabled', message: safeMessage('disabled'), run: null };
    const credentials = getAutomationWorkflowCredentials(env);
    if (
      !credentials.ok ||
      !credentials.credentials.some((item) => item.workflowPrincipalKey === input.principalKey)
    )
      return {
        ok: false,
        code: 'misconfigured',
        message: safeMessage('misconfigured'),
        run: null,
      };

    let control = await controlFor(input.workflowKey);
    let halfOpenProbe = false;
    if (isAutomationWorkflowPausedByConfig(input.workflowKey, env) || control.paused)
      return { ok: false, code: 'paused', message: safeMessage('paused'), run: null };
    if (control.circuit.mode === 'open') {
      const openedAt = control.circuit.openedAt ? Date.parse(control.circuit.openedAt) : now();
      if (now() - openedAt < CIRCUIT_OPEN_MS)
        return { ok: false, code: 'paused', message: safeMessage('paused'), run: null };
      halfOpenProbe = true;
    } else if (control.circuit.mode === 'half-open') {
      return { ok: false, code: 'paused', message: safeMessage('paused'), run: null };
    }

    const createdMs = now();
    const createdAt = new Date(createdMs).toISOString();
    const runKey = createOpaqueAutomationKey('run');
    const reserved = await deps.store.reserveIdempotency({
      workflowKey: input.workflowKey,
      idempotencyKey: input.idempotencyKey,
      runKey,
      payloadDigest: input.payloadDigest,
      ttlSeconds: contract.retentionSeconds,
    });
    if (reserved.status === 'conflict')
      return {
        ok: false,
        code: 'invalid-input',
        message: safeMessage('invalid-input'),
        run: null,
      };
    if (reserved.status === 'replay') {
      const replayed = await deps.store.getRun(reserved.runKey);
      return replayed
        ? { ok: true, code: 'replay', message: safeMessage('replay'), run: replayed }
        : { ok: false, code: 'failed', message: safeMessage('failed'), run: null };
    }

    let run: AutomationRunRecord = {
      runKey,
      workflowKey: input.workflowKey,
      principalKey: input.principalKey,
      principalId: principal.principalId,
      trigger: input.trigger,
      status: 'queued',
      attempt: 1,
      idempotencyKey: input.idempotencyKey,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      resultCode: null,
      summary: null,
      proposalKey: null,
      artifactKey: null,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(createdMs + contract.retentionSeconds * 1000).toISOString(),
    };
    await deps.store.putRun(run, contract.retentionSeconds);
    const lease = await deps.store.acquireWorkflowLease(
      input.workflowKey,
      Math.ceil(contract.timeoutMs / 1000),
      runKey,
      input.principalKey,
    );
    if (lease.status === 'busy') {
      run = finishRun(run, now(), 'skipped', 'no-change', 'Omitida por límite de concurrencia.');
      await deps.store.putRun(run, contract.retentionSeconds);
      return { ok: false, code: 'busy', message: safeMessage('busy'), run };
    }

    try {
      if (halfOpenProbe) {
        control = {
          ...control,
          circuit: { ...control.circuit, mode: 'half-open' },
          updatedAt: new Date(now()).toISOString(),
        };
        await deps.store.putWorkflowControl(control);
      }
      run = {
        ...run,
        status: 'running',
        startedAt: new Date(now()).toISOString(),
        updatedAt: new Date(now()).toISOString(),
      };
      await deps.store.putRun(run, contract.retentionSeconds);
      return { ok: true, code: 'accepted', message: safeMessage('accepted'), run };
    } catch (error) {
      await deps.store.releaseWorkflowLease(input.workflowKey, lease.token, input.principalKey);
      throw error;
    }
  }

  return {
    async beginScheduledRun(input: {
      workflowKey: AutomationWorkflowKey;
      principalKey: AutomationPrincipalKey;
      scheduledFor: string;
      contractVersion: string;
      payloadDigest: string;
    }): Promise<AutomationStartResult> {
      const scheduledMs = Date.parse(input.scheduledFor);
      if (!isAutomationsScheduleIngressEnabled(env))
        return { ok: false, code: 'disabled', message: safeMessage('disabled'), run: null };
      if (
        input.contractVersion !== AUTOMATION_CONTRACT_VERSION ||
        !Number.isFinite(scheduledMs) ||
        new Date(scheduledMs).toISOString() !== input.scheduledFor
      )
        return {
          ok: false,
          code: 'invalid-input',
          message: safeMessage('invalid-input'),
          run: null,
        };
      const idempotencyKey = `scheduled:${createHash('sha256')
        .update(
          [input.contractVersion, input.workflowKey, input.principalKey, input.scheduledFor].join(
            '\n',
          ),
          'utf8',
        )
        .digest('hex')}`;
      return beginRun({
        workflowKey: input.workflowKey,
        principalKey: input.principalKey,
        trigger: 'scheduled',
        idempotencyKey,
        payloadDigest: input.payloadDigest,
      });
    },

    async start(input: {
      workflowKey: AutomationWorkflowKey;
      principalKey: AutomationPrincipalKey;
      trigger: 'scheduled' | 'manual';
      idempotencyKey: string;
      confirmed?: boolean;
    }): Promise<AutomationStartResult> {
      if (!deps.orchestrator)
        return {
          ok: false,
          code: 'misconfigured',
          message: safeMessage('misconfigured'),
          run: null,
        };
      const begun = await beginRun(input);
      if (!begun.ok || begun.code !== 'accepted' || !begun.run) return begun;
      const contract = getAutomationWorkflowContract(input.workflowKey);
      const createdMs = Date.parse(begun.run.createdAt);
      let run = begun.run;
      let lastError: AutomationOrchestratorError | null = null;
      for (let attempt = 1; attempt <= contract.retry.maxAttempts; attempt += 1) {
        run = {
          ...run,
          attempt,
          trigger: attempt === 1 ? input.trigger : 'retry',
          updatedAt: new Date(now()).toISOString(),
        };
        await deps.store.putRun(run, contract.retentionSeconds);
        try {
          await deps.orchestrator.trigger({
            runKey: run.runKey,
            workflowKey: input.workflowKey,
            principalKey: input.principalKey,
            idempotencyKey: input.idempotencyKey,
            attempt,
            trigger: run.trigger,
          });
          emitAutomationLog(
            buildAutomationLogEvent({
              workflowKey: input.workflowKey,
              principalKey: input.principalKey,
              runKey: run.runKey,
              operation: 'runtime.dispatch',
              status: 'running',
              attempt,
              durationMs: now() - createdMs,
              resultCode: null,
            }),
            deps.log,
          );
          return { ok: true, code: 'accepted', message: safeMessage('accepted'), run };
        } catch (error) {
          lastError =
            error instanceof AutomationOrchestratorError
              ? error
              : new AutomationOrchestratorError(null, true, 'orchestrator-unavailable');
          if (!lastError.retryable || attempt === contract.retry.maxAttempts) break;
          await sleep(contract.retry.backoffSeconds[attempt - 1]! * 1000);
        }
      }
      await deps.store.releaseWorkflowLeaseForRun(
        input.workflowKey,
        run.runKey,
        input.principalKey,
      );
      run = finishRun(
        run,
        now(),
        'failed',
        lastError?.message === 'orchestrator-unavailable' ? 'timed-out' : 'dispatch-failed',
        'El orquestador no aceptó la ejecución.',
      );
      await deps.store.putRun(run, contract.retentionSeconds);
      await updateCircuit(input.workflowKey, true);
      emitAutomationLog(
        buildAutomationLogEvent({
          workflowKey: input.workflowKey,
          principalKey: input.principalKey,
          runKey: run.runKey,
          operation: 'runtime.dispatch',
          status: 'failed',
          attempt: run.attempt,
          durationMs: now() - createdMs,
          resultCode: run.resultCode,
        }),
        deps.log,
      );
      return { ok: false, code: 'failed', message: safeMessage('failed'), run };
    },

    async recordResult(
      input: AutomationResultInput,
    ): Promise<{ ok: boolean; replay: boolean; run: AutomationRunRecord | null }> {
      const run = await deps.store.getRun(input.runKey);
      if (!run || run.workflowKey !== input.workflowKey || run.principalKey !== input.principalKey)
        return { ok: false, replay: false, run: null };
      if (run.proposalKey !== null && run.proposalKey !== input.proposalKey)
        return { ok: false, replay: false, run };
      if (run.status === input.status && run.resultCode === input.resultCode) {
        const sameResult =
          run.summary === input.summary &&
          run.proposalKey === input.proposalKey &&
          Boolean(run.artifactKey) === Boolean(input.artifact);
        return sameResult ? { ok: true, replay: true, run } : { ok: false, replay: false, run };
      }
      if (run.status !== 'running' && run.status !== 'queued')
        return { ok: false, replay: false, run };
      if (!(AUTOMATION_RESULT_CODES as readonly string[]).includes(input.resultCode))
        return { ok: false, replay: false, run };
      const contract = getAutomationWorkflowContract(input.workflowKey);
      if (run.startedAt && now() - Date.parse(run.startedAt) > contract.timeoutMs) {
        const timedOut = finishRun(
          run,
          now(),
          'failed',
          'timed-out',
          'La ejecución superó el tiempo máximo.',
        );
        await deps.store.putRun(timedOut, contract.retentionSeconds);
        await deps.store.releaseWorkflowLeaseForRun(
          input.workflowKey,
          input.runKey,
          input.principalKey,
        );
        await updateCircuit(input.workflowKey, true);
        return { ok: false, replay: false, run: timedOut };
      }
      let artifactKey: string | null = null;
      if (input.artifact) {
        artifactKey = createOpaqueAutomationKey('artifact');
        const artifact: AutomationArtifact = {
          artifactKey,
          runKey: run.runKey,
          workflowKey: run.workflowKey,
          principalKey: run.principalKey,
          kind: contract.outputKind,
          title: input.artifact.title,
          summary: input.artifact.summary,
          items: input.artifact.items,
          proposalKey: input.proposalKey,
          createdAt: new Date(now()).toISOString(),
          expiresAt: run.expiresAt,
        };
        await deps.store.putArtifact(artifact, contract.retentionSeconds);
      }
      const completed = {
        ...finishRun(run, now(), input.status, input.resultCode, input.summary),
        proposalKey: input.proposalKey,
        artifactKey,
      };
      await deps.store.putRun(completed, contract.retentionSeconds);
      await deps.store.releaseWorkflowLeaseForRun(
        input.workflowKey,
        input.runKey,
        input.principalKey,
      );
      await updateCircuit(input.workflowKey, input.status === 'failed');
      return { ok: true, replay: false, run: completed };
    },

    async setPaused(
      workflowKey: AutomationWorkflowKey,
      paused: boolean,
    ): Promise<AutomationWorkflowControl> {
      const current = await controlFor(workflowKey);
      const next = {
        ...current,
        paused,
        circuit: paused
          ? current.circuit
          : { mode: 'closed' as const, consecutiveFailures: 0, openedAt: null },
        updatedAt: new Date(now()).toISOString(),
      };
      await deps.store.putWorkflowControl(next);
      return next;
    },
  };
}

export function buildAutomationRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AutomationRuntime | null {
  const store = buildAutomationStateStore(env);
  const orchestrator = buildN8nClient(env);
  return store && orchestrator ? createAutomationRuntime({ store, orchestrator, env }) : null;
}

export function buildScheduledAutomationRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AutomationRuntime | null {
  const store = buildAutomationStateStore(env);
  return store ? createAutomationRuntime({ store, env }) : null;
}
