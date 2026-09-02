import 'server-only';

import { sanitizeSheetValues } from '@/lib/data/plain';
import { fetchAccessToken, READONLY_SCOPE, SHEETS_BASE } from '@/lib/google/auth';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';
import { assertResolvedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

import { isNutritionFoodItemStructurallyValid } from './food-item-integrity';
import { getNutritionSheetsConfig } from './sheets-config';

function mapHttpStatus(status: number, bodyText: string): SheetReadCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 400 && /Unable to parse range|Unable to parse/i.test(bodyText)) {
    return 'missing-tab';
  }
  return 'read-error';
}

function hasValidFoodItemStructure(
  values: readonly (string | number | boolean | null)[][],
): boolean {
  if (values.length <= 1) return true;
  const headers = values[0]!.map((cell) => String(cell ?? '').trim());

  for (const cells of values.slice(1)) {
    if (cells.every((cell) => cell === null)) continue;
    const row: Record<string, string | number | boolean | null> = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] ?? null;
    });
    if (!isNutritionFoodItemStructurallyValid(row)) return false;
  }
  return true;
}

/** Lee una pestaña del store dedicado de Nutrition Intelligence. Nunca escribe ni hace fallback. */
export async function readNutritionTabValues(tab: string): Promise<ReadTabResult> {
  try {
    const config = getNutritionSheetsConfig();
    if (!config) return { ok: false, code: 'not-configured' };

    const { spreadsheetId, clientEmail, privateKey } = config;
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
      string | number | boolean | null
    )[][];

    if (tab === 'Food Items' && !hasValidFoodItemStructure(plain)) {
      return { ok: false, code: 'read-error' };
    }

    return { ok: true, values: plain };
  } catch {
    return { ok: false, code: 'read-error' };
  }
}
