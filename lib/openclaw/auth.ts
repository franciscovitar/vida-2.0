/**
 * Autenticación HMAC-SHA256 server-to-server para OpenClaw.
 * Sin cookies de usuario. Nunca registrar firma, canonical string ni secreto.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { isAutomationPrincipalEnabled } from '@/lib/automations/config';
import {
  getAutomationPrincipalContract,
  isAutomationPrincipalKey,
} from '@/lib/automations/contracts';
import { resolveOpenClawAgentCredential } from '@/lib/openclaw/agents';
import {
  getOpenClawApiConfig,
  isOpenClawApiEnabled,
  OPENCLAW_MAX_TIMESTAMP_SKEW_MS,
  openClawActorId,
} from '@/lib/openclaw/config';
import type {
  OpenClawAgentId,
  OpenClawAuthDecision,
  OpenClawErrorCode,
  OpenClawReplayKeys,
} from '@/types/openclaw';

export const OPENCLAW_HMAC_PROTOCOL = 'vida2-openclaw-hmac-v2' as const;
export const OPENCLAW_MAX_REQUEST_ID_LENGTH = 128;
export const OPENCLAW_MAX_KEY_ID_LENGTH = 64;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TIMESTAMP_PATTERN = /^[0-9]{13}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

export type { OpenClawAuthDecision };

export function isValidOpenClawRequestId(value: string): boolean {
  return REQUEST_ID_PATTERN.test(value);
}

export function isValidOpenClawKeyId(value: string): boolean {
  return KEY_ID_PATTERN.test(value);
}

export function isValidOpenClawTimestamp(value: string): boolean {
  return TIMESTAMP_PATTERN.test(value);
}

export function isValidOpenClawSignature(value: string): boolean {
  return SIGNATURE_PATTERN.test(value);
}

export function sha256Hex(input: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildCanonicalString(input: {
  timestamp: string;
  requestId: string;
  method: string;
  pathname: string;
  rawBody: string | Buffer | Uint8Array;
}): string {
  const bodyHash = sha256Hex(input.rawBody);
  return [
    OPENCLAW_HMAC_PROTOCOL,
    input.timestamp,
    input.requestId,
    input.method.toUpperCase(),
    input.pathname,
    bodyHash,
  ].join('\n');
}

export function signCanonical(secret: string, canonical: string): string {
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export function signaturesMatch(expectedHex: string, providedHex: string): boolean {
  try {
    if (!isValidOpenClawSignature(expectedHex) || !isValidOpenClawSignature(providedHex)) {
      return false;
    }
    return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(providedHex, 'hex'));
  } catch {
    return false;
  }
}

export function buildOpenClawReplayKeys(input: {
  environment: string;
  principalId?: string;
  /** Compatibilidad con callers previos. */
  agentId?: OpenClawAgentId;
  requestId: string;
  signature: string;
}): OpenClawReplayKeys {
  const principalId =
    input.principalId?.trim() || (input.agentId ? openClawActorId(input.agentId) : 'agent:unknown');
  const namespace = `${OPENCLAW_HMAC_PROTOCOL}\n${input.environment}\n${principalId}`;
  return {
    requestKey: sha256Hex(`${namespace}\nrequest\n${input.requestId}`),
    canonicalKey: sha256Hex(`${namespace}\ncanonical\n${input.signature}`),
  };
}

function resolveReplayEnvironment(env: Readonly<Record<string, string | undefined>>): string {
  const value = env.VERCEL_ENV ?? env.NODE_ENV ?? 'unknown';
  return /^[a-z0-9-]{1,32}$/.test(value) ? value : 'unknown';
}

function unauthorized(): {
  ok: false;
  code: OpenClawErrorCode;
  message: string;
} {
  return {
    ok: false,
    code: 'unauthorized',
    message: 'Autenticación inválida.',
  };
}

export function verifyOpenClawRequest(input: {
  env?: Readonly<Record<string, string | undefined>>;
  method: string;
  pathname: string;
  rawBody: string | Buffer | Uint8Array;
  keyIdHeader: string | null;
  timestampHeader: string | null;
  signatureHeader: string | null;
  requestIdHeader: string | null;
  nowMs?: number;
}): OpenClawAuthDecision {
  const env = input.env ?? process.env;
  if (!isOpenClawApiEnabled(env)) {
    return { ok: false, code: 'api-disabled', message: 'API OpenClaw desactivada.' };
  }

  const requestId = input.requestIdHeader ?? '';
  if (!isValidOpenClawRequestId(requestId)) return unauthorized();

  const config = getOpenClawApiConfig(env);
  if (!config.ok) {
    return config.reason === 'flag-disabled'
      ? { ok: false, code: 'api-disabled', message: 'API OpenClaw desactivada.' }
      : unauthorized();
  }

  const keyId = input.keyIdHeader ?? '';
  if (!isValidOpenClawKeyId(keyId)) return unauthorized();

  const credential = resolveOpenClawAgentCredential(keyId, env);
  if (!credential) return unauthorized();

  const principalId = credential.principalId?.trim() || openClawActorId(credential.agentId);
  const workflowPrincipalKeyRaw = credential.workflowPrincipalKey?.trim() || null;
  const workflowPrincipalKey =
    workflowPrincipalKeyRaw && isAutomationPrincipalKey(workflowPrincipalKeyRaw)
      ? workflowPrincipalKeyRaw
      : null;
  if (workflowPrincipalKeyRaw && !workflowPrincipalKey) {
    return unauthorized();
  }

  const workflowKey = credential.workflowKey?.trim() || null;
  if (workflowPrincipalKey) {
    const contract = getAutomationPrincipalContract(workflowPrincipalKey);
    if (
      contract.agentId !== credential.agentId ||
      contract.principalId !== principalId ||
      contract.workflowKey !== workflowKey ||
      !isAutomationPrincipalEnabled(workflowPrincipalKey, env)
    ) {
      return unauthorized();
    }
  } else if (workflowKey) {
    return unauthorized();
  }

  const timestampRaw = input.timestampHeader ?? '';
  if (!isValidOpenClawTimestamp(timestampRaw)) return unauthorized();

  const timestampMs = Number.parseInt(timestampRaw, 10);
  if (!Number.isSafeInteger(timestampMs)) return unauthorized();

  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - timestampMs) > OPENCLAW_MAX_TIMESTAMP_SKEW_MS) {
    return unauthorized();
  }

  const signature = input.signatureHeader ?? '';
  if (!isValidOpenClawSignature(signature)) return unauthorized();

  const canonical = buildCanonicalString({
    timestamp: timestampRaw,
    requestId,
    method: input.method,
    pathname: input.pathname,
    rawBody: input.rawBody,
  });
  const expected = signCanonical(credential.secret, canonical);
  if (!signaturesMatch(expected, signature)) return unauthorized();

  return {
    ok: true,
    keyId,
    agentId: credential.agentId,
    principalId,
    workflowPrincipalKey,
    workflowKey,
    actorId: principalId,
    requestId,
    replayKeys: buildOpenClawReplayKeys({
      environment: resolveReplayEnvironment(env),
      principalId,
      requestId,
      signature,
    }),
  };
}
