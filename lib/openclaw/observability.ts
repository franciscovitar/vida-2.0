/**
 * Logs sanitizados OpenClaw (sin body, secreto, firma ni contenido privado).
 * Trazas opacas: nunca se conservan requestId, keyId ni credenciales crudas.
 */
import { createHash } from 'node:crypto';

import type { OpenClawAgentId, OpenClawDataFreshness } from '@/types/openclaw';

const TRACE_HEX_LENGTH = 32;

export type OpenClawLogEvent = {
  operation: string;
  durationMs: number;
  result: 'ok' | 'error';
  errorCode: string | null;
  itemCount: number | null;
  sourceCount: number | null;
  dataFreshness: OpenClawDataFreshness | null;
  requestTrace: string;
  clientTrace: string;
};

const AUTHORIZED_LOG_KEYS = new Set([
  'operation',
  'durationMs',
  'result',
  'errorCode',
  'itemCount',
  'sourceCount',
  'dataFreshness',
  'requestTrace',
  'clientTrace',
]);

function domainHash(domain: 'request' | 'client', value: string): string {
  return createHash('sha256')
    .update(`vida2:openclaw:${domain}:${value}`, 'utf8')
    .digest('hex')
    .slice(0, TRACE_HEX_LENGTH);
}

export function openClawRequestTrace(requestId: string): string {
  return domainHash('request', requestId);
}

export function openClawClientTrace(agentId: string): string {
  return domainHash('client', agentId);
}

export function buildOpenClawLogEvent(input: {
  requestId: string;
  operation: string;
  principalId?: string;
  agentId?: OpenClawAgentId;
  /** Compatibilidad de tests históricos; las rutas nuevas siempre envían agentId. */
  keyId?: string;
  durationMs: number;
  result: 'ok' | 'error';
  errorCode?: string | null;
  itemCount?: number | null;
  sourceCount?: number | null;
  dataFreshness?: OpenClawDataFreshness | null;
}): OpenClawLogEvent {
  const principal = input.principalId?.trim() || input.agentId || input.keyId || 'unknown-agent';
  return {
    operation: input.operation,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    result: input.result,
    errorCode: input.errorCode ?? null,
    itemCount: input.itemCount ?? null,
    sourceCount: input.sourceCount ?? null,
    dataFreshness: input.dataFreshness ?? null,
    requestTrace: openClawRequestTrace(input.requestId),
    clientTrace: openClawClientTrace(principal),
  };
}

export function openClawLogLooksSafe(event: OpenClawLogEvent): boolean {
  const keys = Object.keys(event);
  if (keys.some((key) => !AUTHORIZED_LOG_KEYS.has(key))) return false;
  if ('proposalCreated' in event || 'requestId' in event || 'keyId' in event) return false;
  if ('agentId' in event || 'keyIdObscured' in event) return false;

  if (!/^[0-9a-f]{32}$/.test(event.requestTrace)) return false;
  if (!/^[0-9a-f]{32}$/.test(event.clientTrace)) return false;

  const json = JSON.stringify(event);
  if (/secret_|Bearer |BEGIN PRIVATE|notion\.so|X-Vida-Signature/i.test(json)) return false;
  if (/journal/i.test(json)) return false;
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(json)) return false;
  return true;
}

export function emitOpenClawLog(event: OpenClawLogEvent): void {
  if (!openClawLogLooksSafe(event)) return;
  console.info(JSON.stringify({ scope: 'openclaw', ...event }));
}
