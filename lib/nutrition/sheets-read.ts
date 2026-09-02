import 'server-only';

import { sanitizeSheetValues } from '@/lib/data/plain';
import { fetchAccessToken, READONLY_SCOPE, SHEETS_BASE } from '@/lib/google/auth';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';
import { assertResolvedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

export interface NutritionSheetsEnv {
  [key: string]: string | undefined;
  GOOGLE_NUTRITION_SPREADSHEET_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, '\n');
}

function mapHttpStatus(status: number, bodyText: string): SheetReadCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 400 && /Unable to parse range|Unable to parse/i.test(bodyText)) {
    return 'missing-tab';
  }
  return 'read-error';
}

export function resolveNutritionSheetsConfig(env: NutritionSheetsEnv = process.env):
  | {
      ok: true;
      config: { spreadsheetId: string; clientEmail: string; privateKey: string };
    }
  | { ok: false; code: 'not-configured' } {
  const spreadsheetId = env.GOOGLE_NUTRITION_SPREADSHEET_ID?.trim() ?? '';
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? '';
  const privateKeyRaw = env.GOOGLE_PRIVATE_KEY?.trim() ?? '';

  if (!spreadsheetId || !clientEmail || !privateKeyRaw) {
    return { ok: false, code: 'not-configured' };
  }

  return {
    ok: true,
    config: {
      spreadsheetId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKeyRaw),
    },
  };
}

/** Lee una pestaña del store dedicado de Nutrition Intelligence. Nunca escribe ni hace fallback. */
export async function readNutritionTabValues(tab: string): Promise<ReadTabResult> {
  try {
    const resolved = resolveNutritionSheetsConfig();
    if (!resolved.ok) return resolved;

    const { spreadsheetId, clientEmail, privateKey } = resolved.config;
    try {
      assertResolvedSpreadsheetId(spreadsheetId, spreadsheetId);
    } catch {
      return { ok: false, code: 'read-error' };
    }

    const tokenResult = await fetchAccessToken(clientEmail, privateKey, READONLY_SCOPE);
    if (!tokenResult.ok) return { ok: false, code: tokenResult.code };

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
      if (Array.isArray(parsed.values)) values = parsed.values as unknown[][];
    } catch {
      return { ok: false, code: 'read-error' };
    }

    const plain = JSON.parse(JSON.stringify(sanitizeSheetValues(values))) as (
      | string
      | number
      | boolean
      | null
    )[][];
    return { ok: true, values: plain };
  } catch {
    return { ok: false, code: 'read-error' };
  }
}
