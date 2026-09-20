import 'server-only';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { getGoogleConfig } from '@/lib/data/config';
import { sanitizeSheetValues } from '@/lib/data/plain';
import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import { readTabValues } from '@/lib/google/sheets-read';
import {
  HEALTH_CHECKIN_HEADERS,
  HEALTH_CHECKIN_TAB,
  type HealthCheckin,
  type HealthCheckinCell,
  type HealthCheckinSheetPort,
  parseHealthCheckinSnapshot,
} from '@/lib/health/checkin';

function mapStatus(
  status: number,
): 'permission-error' | 'auth-error' | 'read-error' | 'write-error' {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  return status >= 400 && status < 500 ? 'write-error' : 'read-error';
}

async function withDevSheetAuth(): Promise<
  | { ok: true; token: string; spreadsheetId: string }
  | { ok: false; code: 'not-configured' | 'auth-error' | 'permission-error' | 'write-error' }
> {
  const config = getGoogleConfig();
  if (!config.ok || config.config.target !== 'dev' || !config.config.writesAllowed) {
    return { ok: false, code: 'not-configured' };
  }

  const token = await fetchAccessToken(
    config.config.clientEmail,
    config.config.privateKey,
    SPREADSHEETS_SCOPE,
  );
  if (!token.ok) {
    return {
      ok: false,
      code: token.code === 'permission-error' ? 'permission-error' : 'auth-error',
    };
  }

  return {
    ok: true,
    token: token.token,
    spreadsheetId: config.config.spreadsheetId,
  };
}

export const googleHealthCheckinSheetPort: HealthCheckinSheetPort = {
  async readAll() {
    const auth = await withDevSheetAuth();
    if (!auth.ok) {
      const code = auth.code === 'write-error' ? 'read-error' : auth.code;
      return { ok: false, code };
    }

    const range = encodeURIComponent(HEALTH_CHECKIN_TAB);
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${range}` +
      '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${auth.token}` },
        cache: 'no-store',
      });
      const bodyText = await response.text();
      if (!response.ok) {
        const code = mapStatus(response.status);
        return {
          ok: false,
          code: code === 'write-error' ? 'read-error' : code,
        };
      }
      const parsed = JSON.parse(bodyText) as { values?: unknown };
      const values = Array.isArray(parsed.values) ? (parsed.values as unknown[][]) : [];
      return { ok: true, values: sanitizeSheetValues(values) as HealthCheckinCell[][] };
    } catch {
      return { ok: false, code: 'read-error' };
    }
  },

  async writeRow(rangeA1, values) {
    const match = /^'Health Check-ins'!A(\d+):K(\d+)$/.exec(rangeA1);
    if (!match || match[1] !== match[2] || values.length !== HEALTH_CHECKIN_HEADERS.length) {
      return { ok: false, code: 'write-error' };
    }

    const auth = await withDevSheetAuth();
    if (!auth.ok) return auth;

    const url =
      `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
      '?valueInputOption=RAW';

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: rangeA1,
          majorDimension: 'ROWS',
          values: [[...values]],
        }),
        cache: 'no-store',
      });
      await response.text();
      if (!response.ok) {
        const code = mapStatus(response.status);
        return {
          ok: false,
          code: code === 'read-error' ? 'write-error' : code,
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, code: 'write-error' };
    }
  },
};

export interface HealthCheckinSnapshot {
  targetDate: string;
  writable: boolean;
  state: 'ready' | 'empty' | 'unavailable' | 'error';
  notice: string | null;
  today: HealthCheckin | null;
}

export async function loadHealthCheckinSnapshot(
  targetDate: string = todayInBuenosAires(),
): Promise<HealthCheckinSnapshot> {
  const config = getGoogleConfig();
  if (!config.ok || config.config.target !== 'dev') {
    return {
      targetDate,
      writable: false,
      state: 'unavailable',
      notice: 'Health Check-in V1 está habilitado sólo en DEV/Preview durante este gate.',
      today: null,
    };
  }

  const read = await readTabValues(HEALTH_CHECKIN_TAB);
  if (!read.ok) {
    return {
      targetDate,
      writable: false,
      state: read.code === 'read-error' || read.code === 'auth-error' ? 'error' : 'unavailable',
      notice:
        read.code === 'missing-tab'
          ? 'Falta la pestaña DEV Health Check-ins.'
          : 'No se pudo leer Health Check-ins en DEV.',
      today: null,
    };
  }

  const parsed = parseHealthCheckinSnapshot(read.values, targetDate);
  if (!parsed.ok) {
    return {
      targetDate,
      writable: false,
      state: 'error',
      notice:
        parsed.code === 'duplicate-date'
          ? 'Health Check-ins contiene fechas duplicadas.'
          : 'Health Check-ins no coincide con el contrato V1.',
      today: null,
    };
  }

  return {
    targetDate,
    writable: true,
    state: parsed.today ? 'ready' : 'empty',
    notice: null,
    today: parsed.today,
  };
}
