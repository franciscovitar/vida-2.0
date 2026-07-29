/**
 * Real Google Calendar hold client (injectable).
 * Uses Calendar OAuth credentials (same shape as config-resolve). Never exposes providerEventId.
 * Tests inject fakes; this module is not exercised against live Google in the suite.
 */
import {
  buildPrivateHoldEventBody,
  type CalendarHoldApiClient,
  type CalendarHoldInsertInput,
} from '@/lib/actions/calendar-hold';
import type { OwnershipProof } from '@/lib/actions/ports';
import type { CalendarOAuthConfig } from '@/lib/calendar/config-resolve';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_TIMEOUT_MS = 8_000;

export type GoogleCalendarHoldClientDeps = {
  oauth: Pick<CalendarOAuthConfig, 'clientId' | 'clientSecret' | 'refreshToken'>;
  /** Authorized write calendar only (GOOGLE_CALENDAR_WRITE_ID). */
  writeCalendarId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Optional: override access-token fetch (tests). */
  getAccessToken?: () => Promise<{ ok: true; token: string } | { ok: false }>;
};

function sanitizeError(): string {
  return 'Operación Calendar hold no disponible.';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function fetchAccessToken(
  oauth: GoogleCalendarHoldClientDeps['oauth'],
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        refresh_token: oauth.refreshToken,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as { access_token?: unknown };
    return typeof parsed.access_token === 'string' && parsed.access_token
      ? parsed.access_token
      : null;
  } catch {
    return null;
  }
}

export function createGoogleCalendarHoldApiClient(
  deps: GoogleCalendarHoldClientDeps,
): CalendarHoldApiClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const writeCalendarId = deps.writeCalendarId.trim();

  async function accessToken(): Promise<string | null> {
    if (deps.getAccessToken) {
      const result = await deps.getAccessToken();
      return result.ok ? result.token : null;
    }
    return fetchAccessToken(deps.oauth, fetchImpl);
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: true; json: unknown } | { ok: false; message: string }> {
    const token = await accessToken();
    if (!token) return { ok: false, message: sanitizeError() };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${CALENDAR_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        void text;
        return { ok: false, message: sanitizeError() };
      }
      if (!text) return { ok: true, json: null };
      try {
        return { ok: true, json: JSON.parse(text) as unknown };
      } catch {
        return { ok: false, message: sanitizeError() };
      }
    } catch {
      return { ok: false, message: sanitizeError() };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async insertPrivateHold(input: CalendarHoldInsertInput) {
      if (input.calendarId !== writeCalendarId) {
        return { ok: false, message: sanitizeError() };
      }
      const body = buildPrivateHoldEventBody(input);
      const providerEventId = input.providerEventId;
      const payload: Record<string, unknown> = {
        summary: body.summary,
        description: body.description,
        start: body.start,
        end: body.end,
        visibility: body.visibility,
        extendedProperties: body.extendedProperties,
      };
      if (providerEventId) {
        payload.id = providerEventId;
      }
      const path = `/calendars/${encodeURIComponent(writeCalendarId)}/events?sendUpdates=none`;
      const result = await request('POST', path, payload);
      if (!result.ok) return result;
      const json = result.json;
      const id =
        isObject(json) && typeof json.id === 'string' && json.id ? json.id : providerEventId;
      if (!id) return { ok: false, message: sanitizeError() };
      return { ok: true, providerEventId: id };
    },

    async getHoldByProviderId(calendarId, providerEventId) {
      if (calendarId !== writeCalendarId) {
        return { ok: false, message: sanitizeError() };
      }
      const path = `/calendars/${encodeURIComponent(writeCalendarId)}/events/${encodeURIComponent(providerEventId)}`;
      const result = await request('GET', path);
      if (!result.ok) return result;
      const json = result.json;
      if (!isObject(json)) return { ok: false, message: sanitizeError() };
      const extended = isObject(json.extendedProperties) ? json.extendedProperties : null;
      const privateProps = extended && isObject(extended.private) ? extended.private : null;
      const ownership =
        privateProps && typeof privateProps.vida2Ownership === 'string'
          ? (privateProps.vida2Ownership as OwnershipProof)
          : null;
      const relatedRaw =
        privateProps && typeof privateProps.vida2RelatedTaskKey === 'string'
          ? privateProps.vida2RelatedTaskKey
          : '';
      const startObj = isObject(json.start) ? json.start : null;
      const endObj = isObject(json.end) ? json.end : null;
      const start = startObj && typeof startObj.dateTime === 'string' ? startObj.dateTime : '';
      const end = endObj && typeof endObj.dateTime === 'string' ? endObj.dateTime : '';
      if (!start || !end) return { ok: false, message: sanitizeError() };
      return {
        ok: true,
        title: typeof json.summary === 'string' ? json.summary : '',
        start,
        end,
        ownership,
        relatedTaskKey: relatedRaw || null,
      };
    },

    async deleteHoldByProviderId(calendarId, providerEventId, ownership) {
      if (calendarId !== writeCalendarId) {
        return { ok: false, code: 'not-configured', message: sanitizeError() };
      }
      const got = await this.getHoldByProviderId(calendarId, providerEventId);
      if (!got.ok) {
        return { ok: false, code: 'not-found', message: 'Hold no encontrado.' };
      }
      if (!got.ownership || got.ownership !== ownership) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      const path = `/calendars/${encodeURIComponent(writeCalendarId)}/events/${encodeURIComponent(providerEventId)}?sendUpdates=none`;
      const result = await request('DELETE', path);
      if (!result.ok) {
        return { ok: false, code: 'failed', message: result.message };
      }
      return { ok: true };
    },

    async getCalendar(calendarId) {
      if (calendarId !== writeCalendarId) {
        return { ok: false, message: sanitizeError() };
      }
      const path = `/calendars/${encodeURIComponent(writeCalendarId)}`;
      const result = await request('GET', path);
      if (!result.ok) return result;
      const json = result.json;
      if (!isObject(json) || typeof json.id !== 'string' || !json.id) {
        return { ok: false, message: sanitizeError() };
      }
      return {
        ok: true,
        id: json.id,
        primary: json.primary === true,
        timeZone: typeof json.timeZone === 'string' ? json.timeZone : null,
      };
    },
  };
}
