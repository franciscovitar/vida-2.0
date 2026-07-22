/**
 * Feature flag y configuración OpenClaw (solo servidor).
 */
import type { OpenClawRuntimeStatus } from '@/types/openclaw';

export const OPENCLAW_MAX_BODY_BYTES = 64 * 1024;
export const OPENCLAW_MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
export const OPENCLAW_MAX_LIST_LIMIT = 50;
export const OPENCLAW_MAX_CALENDAR_DAYS = 31;
export const OPENCLAW_DEFAULT_RATE_PER_MINUTE = 60;

export function isOpenClawApiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.OPENCLAW_API_ENABLED === 'true';
}

export type OpenClawApiConfig =
  | {
      ok: true;
      keyId: string;
      secret: string;
      ratePerMinute: number;
    }
  | { ok: false; reason: 'flag-disabled' | 'misconfigured' };

export function getOpenClawApiConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawApiConfig {
  if (!isOpenClawApiEnabled(env)) {
    return { ok: false, reason: 'flag-disabled' };
  }
  const keyId = env.OPENCLAW_API_KEY_ID?.trim() ?? '';
  const secret = env.OPENCLAW_API_SECRET?.trim() ?? '';
  if (!keyId || !secret) {
    return { ok: false, reason: 'misconfigured' };
  }
  const rawRate = Number(env.OPENCLAW_API_RATE_PER_MINUTE ?? OPENCLAW_DEFAULT_RATE_PER_MINUTE);
  const ratePerMinute =
    Number.isFinite(rawRate) && rawRate > 0
      ? Math.min(Math.floor(rawRate), 300)
      : OPENCLAW_DEFAULT_RATE_PER_MINUTE;
  return { ok: true, keyId, secret, ratePerMinute };
}

/** Estado sanitizado para Ajustes (sin key ID ni secretos). */
export function getOpenClawRuntimeStatus(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenClawRuntimeStatus {
  if (!isOpenClawApiEnabled(env)) return 'disabled';
  const config = getOpenClawApiConfig(env);
  return config.ok ? 'ready' : 'misconfigured';
}

export function openClawActorId(keyId: string): string {
  return `openclaw:${keyId.trim()}`;
}

export function obscureKeyId(keyId: string): string {
  const trimmed = keyId.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 2)}…${trimmed.slice(-2)}`;
}
