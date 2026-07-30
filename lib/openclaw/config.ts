/**
 * Feature flag y configuración OpenClaw (solo servidor).
 */
import { getOpenClawAgentCredentials } from '@/lib/openclaw/agents';
import type {
  OpenClawAccessMode,
  OpenClawAgentCredential,
  OpenClawAgentId,
  OpenClawRuntimeStatus,
} from '@/types/openclaw';

export const OPENCLAW_MAX_BODY_BYTES = 64 * 1024;
export const OPENCLAW_MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
export const OPENCLAW_MAX_LIST_LIMIT = 50;
export const OPENCLAW_MAX_CALENDAR_DAYS = 31;
export const OPENCLAW_DEFAULT_RATE_PER_MINUTE = 60;
export const OPENCLAW_REPLAY_TTL_SECONDS = 15 * 60;

export type OpenClawAccessModeResolution = OpenClawAccessMode | 'invalid';

export function resolveOpenClawAccessMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawAccessModeResolution {
  const value = env.OPENCLAW_ACCESS_MODE?.trim();
  if (!value || value === 'disabled') return 'disabled';
  if (value === 'read-only' || value === 'full') return value;
  return 'invalid';
}

export function isOpenClawApiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.OPENCLAW_API_ENABLED === 'true' && resolveOpenClawAccessMode(env) === 'read-only';
}

export type OpenClawApiConfig =
  | {
      ok: true;
      credentials: readonly OpenClawAgentCredential[];
      ratePerMinute: number;
      accessMode: 'read-only';
    }
  | {
      ok: false;
      reason:
        'flag-disabled' | 'access-mode-disabled' | 'access-mode-unsupported' | 'misconfigured';
    };

export function getOpenClawApiConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawApiConfig {
  if (env.OPENCLAW_API_ENABLED !== 'true') {
    return { ok: false, reason: 'flag-disabled' };
  }
  const accessMode = resolveOpenClawAccessMode(env);
  if (accessMode === 'disabled') {
    return { ok: false, reason: 'access-mode-disabled' };
  }
  if (accessMode !== 'read-only') {
    return { ok: false, reason: 'access-mode-unsupported' };
  }

  const credentialResolution = getOpenClawAgentCredentials(env);
  if (!credentialResolution.ok) {
    return { ok: false, reason: 'misconfigured' };
  }

  const rawRate = Number(env.OPENCLAW_API_RATE_PER_MINUTE ?? OPENCLAW_DEFAULT_RATE_PER_MINUTE);
  const ratePerMinute =
    Number.isFinite(rawRate) && rawRate > 0
      ? Math.min(Math.floor(rawRate), 300)
      : OPENCLAW_DEFAULT_RATE_PER_MINUTE;

  return {
    ok: true,
    credentials: credentialResolution.credentials,
    ratePerMinute,
    accessMode,
  };
}

/** Estado sanitizado para Ajustes (sin key IDs ni secretos). */
export function getOpenClawRuntimeStatus(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawRuntimeStatus {
  if (env.OPENCLAW_API_ENABLED !== 'true') return 'disabled';
  const config = getOpenClawApiConfig(env);
  return config.ok ? 'read-only' : 'misconfigured';
}

export function openClawActorId(agentId: OpenClawAgentId): string {
  return `agent:${agentId}`;
}

export function obscureKeyId(keyId: string): string {
  const trimmed = keyId.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
}
