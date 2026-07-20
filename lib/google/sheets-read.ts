/**
 * Lectura del Sheet DEV sin googleapis/gaxios.
 */
import { sanitizeSheetValues } from '@/lib/data/plain';
import { assertAllowedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

import { getGoogleConfig } from '../data/config';
import { fetchAccessToken, READONLY_SCOPE, SHEETS_BASE } from './auth';
import type { ReadTabResult, SheetReadCode } from './errors';

function mapHttpStatus(status: number, bodyText: string): SheetReadCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 400 && /Unable to parse range|Unable to parse/i.test(bodyText)) {
    return 'missing-tab';
  }
  return 'read-error';
}

/**
 * Lee los valores de una pestaña completa (rango = nombre de la pestaña).
 * Devuelve valores planos serializables o un código de error; nunca lanza.
 */
export async function readTabValues(tab: string): Promise<ReadTabResult> {
  try {
    const result = getGoogleConfig();
    if (!result.ok) {
      return { ok: false, code: 'not-configured' };
    }

    const { clientEmail, privateKey, spreadsheetId } = result.config;

    try {
      assertAllowedSpreadsheetId(spreadsheetId);
    } catch {
      return { ok: false, code: 'read-error' };
    }

    const tokenResult = await fetchAccessToken(clientEmail, privateKey, READONLY_SCOPE);
    if (!tokenResult.ok) {
      return { ok: false, code: tokenResult.code };
    }

    const range = encodeURIComponent(tab);
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}` +
      `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenResult.token}` },
        cache: 'no-store',
      });
    } catch {
      return { ok: false, code: 'read-error' };
    }

    const bodyText = await response.text();
    if (!response.ok) {
      return { ok: false, code: mapHttpStatus(response.status, bodyText) };
    }

    let values: unknown[][] = [];
    try {
      const parsed = JSON.parse(bodyText) as { values?: unknown };
      if (Array.isArray(parsed.values)) {
        values = parsed.values as unknown[][];
      }
    } catch {
      return { ok: false, code: 'read-error' };
    }

    const plain = JSON.parse(JSON.stringify(sanitizeSheetValues(values))) as (
      string | number | boolean | null
    )[][];

    return { ok: true, values: plain };
  } catch {
    return { ok: false, code: 'read-error' };
  }
}

/** Mapeo de fallos HTTP (exportado para pruebas). */
export function mapGoogleFailure(error: unknown, tab: string): SheetReadCode {
  void tab;
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const status = record.status ?? record.code;
    if (status === 401) return 'auth-error';
    if (status === 403) return 'permission-error';
    if (typeof status === 'number') return mapHttpStatus(status, String(record.message ?? ''));
  }
  return 'read-error';
}
