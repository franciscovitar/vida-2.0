/**
 * Logs sanitizados OpenClaw (sin body, secreto, firma ni contenido privado).
 */
import { obscureKeyId } from '@/lib/openclaw/config';

export type OpenClawLogEvent = {
  requestId: string;
  operation: string;
  keyIdObscured: string;
  durationMs: number;
  result: 'ok' | 'error';
  errorCode: string | null;
  itemCount: number | null;
  proposalCreated: boolean;
};

export function buildOpenClawLogEvent(input: {
  requestId: string;
  operation: string;
  keyId: string;
  durationMs: number;
  result: 'ok' | 'error';
  errorCode?: string | null;
  itemCount?: number | null;
  proposalCreated?: boolean;
}): OpenClawLogEvent {
  return {
    requestId: input.requestId,
    operation: input.operation,
    keyIdObscured: obscureKeyId(input.keyId),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    result: input.result,
    errorCode: input.errorCode ?? null,
    itemCount: input.itemCount ?? null,
    proposalCreated: Boolean(input.proposalCreated),
  };
}

export function openClawLogLooksSafe(event: OpenClawLogEvent): boolean {
  const json = JSON.stringify(event);
  if (/secret_|Bearer |BEGIN PRIVATE|notion\.so|X-Vida-Signature/i.test(json)) return false;
  if (/journal/i.test(json)) return false;
  return true;
}

/** Emite a stdout en una sola línea JSON sanitizada. */
export function emitOpenClawLog(event: OpenClawLogEvent): void {
  if (!openClawLogLooksSafe(event)) return;
  console.info(JSON.stringify({ scope: 'openclaw', ...event }));
}
