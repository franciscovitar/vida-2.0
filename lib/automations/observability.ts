import { createHash } from 'node:crypto';

import {
  AUTOMATION_RESULT_CODES,
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_WORKFLOW_KEYS,
  type AutomationPrincipalKey,
  type AutomationResultCode,
  type AutomationRunStatus,
  type AutomationWorkflowKey,
} from '@/types/automations';

const TRACE_PATTERN = /^[0-9a-f]{32}$/;
const SAFE_KEYS = new Set([
  'scope',
  'workflowKey',
  'principalTrace',
  'runTrace',
  'operation',
  'status',
  'attempt',
  'durationMs',
  'resultCode',
  'itemCount',
  'at',
]);

export type AutomationLogEvent = {
  scope: 'automations';
  workflowKey: AutomationWorkflowKey;
  principalTrace: string;
  runTrace: string;
  operation: 'callback.result' | 'runtime.dispatch';
  status: AutomationRunStatus | 'rejected';
  attempt: number;
  durationMs: number;
  resultCode: AutomationResultCode | null;
  itemCount: number;
  at: string;
};

function trace(domain: 'principal' | 'run', value: string): string {
  return createHash('sha256')
    .update(`vida2:automations:${domain}:${value}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

export function automationPrincipalTrace(principalKey: AutomationPrincipalKey): string {
  return trace('principal', principalKey);
}

export function automationRunTrace(runKey: string): string {
  return trace('run', runKey);
}

export function buildAutomationLogEvent(input: {
  workflowKey: AutomationWorkflowKey;
  principalKey: AutomationPrincipalKey;
  runKey: string;
  operation: AutomationLogEvent['operation'];
  status: AutomationLogEvent['status'];
  attempt: number;
  durationMs: number;
  resultCode: AutomationResultCode | null;
  itemCount?: number;
  at?: string;
}): AutomationLogEvent {
  return {
    scope: 'automations',
    workflowKey: input.workflowKey,
    principalTrace: automationPrincipalTrace(input.principalKey),
    runTrace: automationRunTrace(input.runKey),
    operation: input.operation,
    status: input.status,
    attempt: Math.min(3, Math.max(1, Math.floor(input.attempt))),
    durationMs: Math.min(900_000, Math.max(0, Math.round(input.durationMs))),
    resultCode: input.resultCode,
    itemCount: Math.min(20, Math.max(0, Math.floor(input.itemCount ?? 0))),
    at: input.at ?? new Date().toISOString(),
  };
}

export function automationLogLooksSafe(event: AutomationLogEvent): boolean {
  const keys = Object.keys(event);
  if (keys.length !== SAFE_KEYS.size || keys.some((key) => !SAFE_KEYS.has(key))) return false;
  if (
    event.scope !== 'automations' ||
    !(AUTOMATION_WORKFLOW_KEYS as readonly string[]).includes(event.workflowKey) ||
    !['callback.result', 'runtime.dispatch'].includes(event.operation) ||
    ![...(AUTOMATION_RUN_STATUSES as readonly string[]), 'rejected'].includes(event.status) ||
    (event.resultCode !== null &&
      !(AUTOMATION_RESULT_CODES as readonly string[]).includes(event.resultCode)) ||
    !Number.isInteger(event.attempt) ||
    event.attempt < 1 ||
    event.attempt > 3 ||
    !Number.isInteger(event.durationMs) ||
    event.durationMs < 0 ||
    event.durationMs > 900_000 ||
    !Number.isInteger(event.itemCount) ||
    event.itemCount < 0 ||
    event.itemCount > 20
  )
    return false;
  if (!TRACE_PATTERN.test(event.principalTrace) || !TRACE_PATTERN.test(event.runTrace))
    return false;
  if (Number.isNaN(Date.parse(event.at)) || event.at.length > 40) return false;
  const serialized = JSON.stringify(event);
  return !/(?:https?:\/\/|bearer\s|secret|token|signature|key.?id|journal|@|run_[A-Za-z0-9_-]+)/i.test(
    serialized,
  );
}

export function emitAutomationLog(
  event: AutomationLogEvent,
  sink: (serialized: string) => void = console.info,
): void {
  if (automationLogLooksSafe(event)) sink(JSON.stringify(event));
}
