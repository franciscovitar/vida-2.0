/**
 * Implementación real del puerto de hábitos: una sola celda, scope spreadsheets.
 * No usa operaciones estructurales ni escritura de rangos múltiples.
 */
import 'server-only';

import { getGoogleConfig } from '@/lib/data/config';
import { assertAllowedSpreadsheetId } from '@/lib/validation/spreadsheet-id';
import { REGISTRO_DIARIO_TAB } from '@/lib/google/constants';
import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import { sanitizeSheetValues } from '@/lib/data/plain';

import type { HabitSheetPort } from './sheet-port';

function mapStatus(status: number): 'permission-error' | 'auth-error' | 'write-error' {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  return 'write-error';
}

async function withWriteToken(): Promise<
  | { ok: true; token: string; spreadsheetId: string }
  | { ok: false; code: 'not-configured' | 'auth-error' | 'permission-error' | 'write-error' }
> {
  const config = getGoogleConfig();
  if (!config.ok) return { ok: false, code: 'not-configured' };
  try {
    assertAllowedSpreadsheetId(config.config.spreadsheetId);
  } catch {
    return { ok: false, code: 'write-error' };
  }
  const token = await fetchAccessToken(
    config.config.clientEmail,
    config.config.privateKey,
    SPREADSHEETS_SCOPE,
  );
  if (!token.ok) {
    if (token.code === 'permission-error') return { ok: false, code: 'permission-error' };
    if (token.code === 'auth-error') return { ok: false, code: 'auth-error' };
    return { ok: false, code: 'write-error' };
  }
  return { ok: true, token: token.token, spreadsheetId: config.config.spreadsheetId };
}

export const googleHabitSheetPort: HabitSheetPort = {
  async readRegistroDiario() {
    const auth = await withWriteToken();
    if (!auth.ok) return auth;

    const range = encodeURIComponent(REGISTRO_DIARIO_TAB);
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${range}` +
      `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${auth.token}` },
        cache: 'no-store',
      });
      const bodyText = await response.text();
      if (!response.ok) return { ok: false, code: mapStatus(response.status) };
      const parsed = JSON.parse(bodyText) as { values?: unknown };
      const values = Array.isArray(parsed.values) ? (parsed.values as unknown[][]) : [];
      return { ok: true, values: sanitizeSheetValues(values) };
    } catch {
      return { ok: false, code: 'write-error' };
    }
  },

  async readCell(rangeA1) {
    const auth = await withWriteToken();
    if (!auth.ok) {
      if (auth.code === 'not-configured') return { ok: false, code: 'write-error' };
      return { ok: false, code: auth.code };
    }

    const url =
      `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
      `?valueRenderOption=UNFORMATTED_VALUE`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${auth.token}` },
        cache: 'no-store',
      });
      const bodyText = await response.text();
      if (!response.ok) return { ok: false, code: mapStatus(response.status) };
      const parsed = JSON.parse(bodyText) as { values?: unknown[][] };
      const value = parsed.values?.[0]?.[0] ?? null;
      return { ok: true, value };
    } catch {
      return { ok: false, code: 'write-error' };
    }
  },

  async writeCell(rangeA1, value) {
    const auth = await withWriteToken();
    if (!auth.ok) {
      if (auth.code === 'not-configured') return { ok: false, code: 'write-error' };
      return { ok: false, code: auth.code };
    }

    // values.update de una sola celda (sin operaciones estructurales).
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
      `?valueInputOption=USER_ENTERED`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ range: rangeA1, majorDimension: 'ROWS', values: [[value]] }),
        cache: 'no-store',
      });
      if (!response.ok) {
        // Consumir cuerpo sin exponerlo.
        await response.text();
        return { ok: false, code: mapStatus(response.status) };
      }
      await response.text();
      return { ok: true };
    } catch {
      return { ok: false, code: 'write-error' };
    }
  },
};
