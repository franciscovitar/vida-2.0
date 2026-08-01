import { randomBytes } from 'node:crypto';

import { AUTOMATION_WORKFLOW_KEYS, type AutomationWorkflowKey } from '@/types/automations';

const MAX_RESPONSE_CHARS = 4 * 1024;
const SECRET_HEADER = 'x-vida-automations-secret';

export type N8nTriggerInput = {
  runKey: string;
  workflowKey: AutomationWorkflowKey;
  principalKey: string;
  idempotencyKey: string;
  attempt: number;
  trigger: 'scheduled' | 'manual' | 'retry';
};

export type N8nTriggerResult = { accepted: true; requestKey: string };

export interface AutomationOrchestratorClient {
  trigger(input: N8nTriggerInput): Promise<N8nTriggerResult>;
}

export class AutomationOrchestratorError extends Error {
  constructor(
    readonly status: number | null,
    readonly retryable: boolean,
    code: 'orchestrator-unavailable' | 'orchestrator-rejected' | 'orchestrator-invalid-response',
  ) {
    super(code);
  }
}

export type N8nClientConfig = { baseUrl: string; secret: string; timeoutMs: number };
export type N8nClientConfigResult =
  | { ok: true; value: N8nClientConfig }
  | { ok: false; reason: 'missing-orchestrator' | 'invalid-orchestrator' };

function normalizeBaseUrl(
  raw: string,
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  try {
    const url = new URL(raw);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (
      url.protocol !== 'https:' &&
      !(local && (env.NODE_ENV === 'development' || env.NODE_ENV === 'test'))
    )
      return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveN8nClientConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): N8nClientConfigResult {
  const rawUrl = env.AUTOMATIONS_N8N_BASE_URL ?? '';
  const rawSecret = env.AUTOMATIONS_N8N_WEBHOOK_SECRET ?? '';
  if (!rawUrl && !rawSecret) return { ok: false, reason: 'missing-orchestrator' };
  const baseUrl = normalizeBaseUrl(rawUrl, env);
  const secret = rawSecret.trim();
  if (
    !baseUrl ||
    secret !== rawSecret ||
    secret.length < 24 ||
    secret.length > 256 ||
    /\s/.test(secret)
  )
    return { ok: false, reason: 'invalid-orchestrator' };
  return { ok: true, value: { baseUrl, secret, timeoutMs: 10_000 } };
}

function isStrictAcceptedResponse(value: unknown, requestKey: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === 3 &&
    keys[0] === 'accepted' &&
    keys[1] === 'ok' &&
    keys[2] === 'requestKey' &&
    record.ok === true &&
    record.accepted === true &&
    record.requestKey === requestKey
  );
}

export function createN8nClient(
  config: N8nClientConfig,
  fetchImpl: typeof fetch = fetch,
): AutomationOrchestratorClient {
  return {
    async trigger(input) {
      if (!(AUTOMATION_WORKFLOW_KEYS as readonly string[]).includes(input.workflowKey))
        throw new AutomationOrchestratorError(null, false, 'orchestrator-rejected');
      const requestKey = `request_${randomBytes(18).toString('base64url')}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(
          `${config.baseUrl}/webhook/vida2/automations/${input.workflowKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', [SECRET_HEADER]: config.secret },
            body: JSON.stringify({
              runKey: input.runKey,
              workflowKey: input.workflowKey,
              principalKey: input.principalKey,
              idempotencyKey: input.idempotencyKey,
              requestKey,
              attempt: input.attempt,
              trigger: input.trigger,
              contractVersion: 'vida2-automations-v1',
            }),
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          const retryable = [429, 500, 502, 503, 504].includes(response.status);
          throw new AutomationOrchestratorError(
            response.status,
            retryable,
            'orchestrator-rejected',
          );
        }
        const raw = await response.text();
        if (!raw || raw.length > MAX_RESPONSE_CHARS)
          throw new AutomationOrchestratorError(
            response.status,
            false,
            'orchestrator-invalid-response',
          );
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw) as unknown;
        } catch {
          throw new AutomationOrchestratorError(
            response.status,
            false,
            'orchestrator-invalid-response',
          );
        }
        if (!isStrictAcceptedResponse(parsed, requestKey))
          throw new AutomationOrchestratorError(
            response.status,
            false,
            'orchestrator-invalid-response',
          );
        return { accepted: true, requestKey };
      } catch (error) {
        if (error instanceof AutomationOrchestratorError) throw error;
        throw new AutomationOrchestratorError(null, true, 'orchestrator-unavailable');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function buildN8nClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
): AutomationOrchestratorClient | null {
  const config = resolveN8nClientConfig(env);
  return config.ok ? createN8nClient(config.value, fetchImpl) : null;
}

export const AUTOMATIONS_N8N_SECRET_HEADER = SECRET_HEADER;
