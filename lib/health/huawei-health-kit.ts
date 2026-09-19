import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  extractHuaweiHrvSamples,
  HUAWEI_HRV_DATA_TYPE,
  isAllowedHuaweiHealthRedirect,
  type HuaweiHealthRuntimeConfig,
  type HuaweiHealthSetupConfig,
} from '@/lib/health/huawei-health-kit-core';

const TOKEN_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v3/token';
const DEFAULT_HEALTH_API = 'https://health-api.cloud.huawei.com/healthkit/v2/sampleSet:polymerize';

type TokenExchangeResult =
  { ok: true; refreshToken: string } | { ok: false; reason: 'exchange-error' | 'no-refresh-token' };

export async function exchangeHuaweiAuthorizationCode(
  config: HuaweiHealthSetupConfig,
  code: string,
): Promise<TokenExchangeResult> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      }),
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, reason: 'exchange-error' };
    const parsed = (await response.json()) as { refresh_token?: unknown };
    const refreshToken =
      typeof parsed.refresh_token === 'string' ? parsed.refresh_token.trim() : '';
    return refreshToken ? { ok: true, refreshToken } : { ok: false, reason: 'no-refresh-token' };
  } catch {
    return { ok: false, reason: 'exchange-error' };
  }
}

async function fetchHuaweiAccessToken(
  config: HuaweiHealthRuntimeConfig,
): Promise<{ ok: true; token: string } | { ok: false; reason: 'auth-error' | 'network-error' }> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, reason: 'auth-error' };
    const parsed = (await response.json()) as { access_token?: unknown };
    const token = typeof parsed.access_token === 'string' ? parsed.access_token : '';
    return token ? { ok: true, token } : { ok: false, reason: 'auth-error' };
  } catch {
    return { ok: false, reason: 'network-error' };
  }
}

async function callHrvApi(input: {
  url: string;
  token: string;
  clientId: string;
  startTime: number;
  endTime: number;
}): Promise<Response> {
  return fetch(input.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
      'x-client-id': input.clientId,
      'x-version': 'vida2-hrv-probe-1',
      'x-caller-trace-id': randomUUID(),
    },
    body: JSON.stringify({
      polymerizeWith: [{ dataTypeName: HUAWEI_HRV_DATA_TYPE }],
      startTime: input.startTime,
      endTime: input.endTime,
    }),
    cache: 'no-store',
    redirect: 'manual',
  });
}

export type HuaweiHrvProbeResult =
  | {
      ok: true;
      sampleCount: number;
      samples: ReturnType<typeof extractHuaweiHrvSamples>;
      apiHost: string;
    }
  | {
      ok: false;
      reason: 'not-configured' | 'auth-error' | 'network-error' | 'permission-error' | 'api-error';
      status?: number;
      huaweiCode?: number;
    };

export async function probeHuaweiHrv(input: {
  config: HuaweiHealthRuntimeConfig;
  startTime: number;
  endTime: number;
}): Promise<HuaweiHrvProbeResult> {
  const access = await fetchHuaweiAccessToken(input.config);
  if (!access.ok) return { ok: false, reason: access.reason };

  let url = DEFAULT_HEALTH_API;
  let response: Response;
  try {
    response = await callHrvApi({
      url,
      token: access.token,
      clientId: input.config.clientId,
      startTime: input.startTime,
      endTime: input.endTime,
    });
  } catch {
    return { ok: false, reason: 'network-error' };
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  const record =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  const error =
    record && typeof record.error === 'object' && record.error !== null
      ? (record.error as Record<string, unknown>)
      : null;
  const huaweiCode = error && typeof error.code === 'number' ? error.code : undefined;

  if (response.status === 403 && huaweiCode === 121001) {
    const location = response.headers.get('location');
    if (location && isAllowedHuaweiHealthRedirect(location)) {
      url = location;
      try {
        response = await callHrvApi({
          url,
          token: access.token,
          clientId: input.config.clientId,
          startTime: input.startTime,
          endTime: input.endTime,
        });
        parsed = await response.json();
      } catch {
        return { ok: false, reason: 'network-error' };
      }
    }
  }

  if (!response.ok) {
    if (response.status === 401)
      return { ok: false, reason: 'auth-error', status: response.status };
    if (response.status === 403) {
      return { ok: false, reason: 'permission-error', status: response.status, huaweiCode };
    }
    return { ok: false, reason: 'api-error', status: response.status, huaweiCode };
  }

  const samples = extractHuaweiHrvSamples(parsed);
  return {
    ok: true,
    sampleCount: samples.length,
    samples,
    apiHost: new URL(url).hostname,
  };
}
