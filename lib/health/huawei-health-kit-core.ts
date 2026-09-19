import { randomBytes, timingSafeEqual } from "node:crypto";

export const HUAWEI_HRV_DATA_TYPE = "com.huawei.heart_rate_variability";
export const HUAWEI_HRV_FIELD = "heartRateVariabilityRMSSD";
export const HUAWEI_OAUTH_AUTH_URL =
  "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize";
export const HUAWEI_OAUTH_STATE_COOKIE = "vida2_huawei_health_oauth_state";

export const HUAWEI_HRV_READ_SCOPES = [
  "openid",
  "profile",
  "https://www.huawei.com/healthkit/heartrate.read",
  "https://www.huawei.com/healthkit/hearthealth.read",
  "https://www.huawei.com/healthkit/historydata.open.week",
] as const;

export type EnvLike = Record<string, string | undefined>;

export interface HuaweiHealthSetupConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface HuaweiHealthRuntimeConfig extends HuaweiHealthSetupConfig {
  refreshToken: string;
}

export function resolveHuaweiHealthSetupConfig(
  env: EnvLike,
):
  | { ok: true; config: HuaweiHealthSetupConfig }
  | { ok: false; reason: "not-configured" } {
  const clientId = env.HUAWEI_HEALTH_CLIENT_ID?.trim();
  const clientSecret = env.HUAWEI_HEALTH_CLIENT_SECRET?.trim();
  const redirectUri =
    env.HUAWEI_HEALTH_REDIRECT_URI?.trim() ||
    "http://localhost:3000/api/health/huawei/oauth/callback";

  if (!clientId || !clientSecret || !redirectUri)
    return { ok: false, reason: "not-configured" };
  return { ok: true, config: { clientId, clientSecret, redirectUri } };
}

export function resolveHuaweiHealthRuntimeConfig(
  env: EnvLike,
):
  | { ok: true; config: HuaweiHealthRuntimeConfig }
  | { ok: false; reason: "not-configured" } {
  const setup = resolveHuaweiHealthSetupConfig(env);
  const refreshToken = env.HUAWEI_HEALTH_REFRESH_TOKEN?.trim();
  if (!setup.ok || !refreshToken)
    return { ok: false, reason: "not-configured" };
  return { ok: true, config: { ...setup.config, refreshToken } };
}

export function isHuaweiHealthLocalProbeAllowed(input: {
  nodeEnv?: string | null;
  vercel?: string | null;
  host?: string | null;
}): boolean {
  if (input.nodeEnv === "production" || input.vercel === "1") return false;
  const host = (input.host ?? "").split(":")[0]?.toLowerCase() ?? "";
  return host === "localhost" || host === "127.0.0.1";
}

export function generateHuaweiOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function huaweiOAuthStateCookieOptions(maxAge = 600) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: false as const,
    maxAge,
    path: "/api/health/huawei/oauth",
  };
}

export function safeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function buildHuaweiConsentUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(HUAWEI_OAUTH_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", HUAWEI_HRV_READ_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function isAllowedHuaweiHealthRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    const allowedHosts = new Set([
      "health-api.cloud.huawei.com",
      "health-api.cloud.huawei.eu",
      "health-api.cloud.huawei.cn",
    ]);
    return (
      url.protocol === "https:" &&
      allowedHosts.has(url.hostname) &&
      url.pathname.startsWith("/healthkit/")
    );
  } catch {
    return false;
  }
}

export interface HuaweiHrvSample {
  rmssdMs: number;
  startTime: number | null;
  endTime: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function extractHuaweiHrvSamples(payload: unknown): HuaweiHrvSample[] {
  const samples: HuaweiHrvSample[] = [];

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const record = asRecord(node);
    if (!record) return;

    if (
      record.dataTypeName === HUAWEI_HRV_DATA_TYPE &&
      Array.isArray(record.value)
    ) {
      for (const item of record.value) {
        const field = asRecord(item);
        if (!field || field.fieldName !== HUAWEI_HRV_FIELD) continue;
        const candidate =
          typeof field.integerValue === "number"
            ? field.integerValue
            : typeof field.floatValue === "number"
              ? field.floatValue
              : typeof field.longValue === "number"
                ? field.longValue
                : null;
        if (
          candidate !== null &&
          Number.isFinite(candidate) &&
          candidate > 0 &&
          candidate <= 200
        ) {
          samples.push({
            rmssdMs: candidate,
            startTime:
              typeof record.startTime === "number" ? record.startTime : null,
            endTime: typeof record.endTime === "number" ? record.endTime : null,
          });
        }
      }
    }

    Object.values(record).forEach(visit);
  };

  visit(payload);
  return samples;
}

export function summarizeHuaweiHrvSamples(samples: readonly HuaweiHrvSample[]) {
  if (samples.length === 0) {
    return {
      available: false as const,
      sampleCount: 0,
      minRmssdMs: null,
      maxRmssdMs: null,
    };
  }
  const values = samples.map((sample) => sample.rmssdMs);
  return {
    available: true as const,
    sampleCount: samples.length,
    minRmssdMs: Math.min(...values),
    maxRmssdMs: Math.max(...values),
  };
}
