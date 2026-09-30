import 'server-only';

import { requireFinanceAccess } from '@/lib/finance/access';
import { getFinanceStoreConfig } from '@/lib/finance/store/config';
import {
  buildFinanceBatchRequests,
  type FinanceMutation,
  type FinanceSheetIds,
} from '@/lib/finance/store/mutation-core';
import {
  FINANCE_SHEETS,
  hasFinanceHeaders,
  type FinanceSheetKey,
} from '@/lib/finance/store/schema';
import {
  fetchAccessToken,
  READONLY_SCOPE,
  SHEETS_BASE,
  SPREADSHEETS_SCOPE,
} from '@/lib/google/auth';

export type FinanceStoreFailureCode =
  | 'disabled'
  | 'not-configured'
  | 'writes-disabled'
  | 'auth-error'
  | 'permission-error'
  | 'missing-tab'
  | 'schema-mismatch'
  | 'read-error'
  | 'write-error';

export type FinanceStoreReadResult =
  { ok: true; values: unknown[][] } | { ok: false; code: FinanceStoreFailureCode };

export type FinanceStoreWriteResult = { ok: true } | { ok: false; code: FinanceStoreFailureCode };

function mapStatus(status: number): FinanceStoreFailureCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 400) return 'missing-tab';
  return 'read-error';
}

async function resolveSheetIds(
  spreadsheetId: string,
  token: string,
): Promise<FinanceSheetIds | null> {
  const url =
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}` +
    '?fields=sheets.properties(sheetId,title)';

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  const bodyText = await response.text();
  if (!response.ok) return null;

  try {
    const parsed = JSON.parse(bodyText) as {
      sheets?: { properties?: { sheetId?: number; title?: string } }[];
    };
    const ids: FinanceSheetIds = {};
    for (const [key, sheet] of Object.entries(FINANCE_SHEETS) as [
      FinanceSheetKey,
      (typeof FINANCE_SHEETS)[FinanceSheetKey],
    ][]) {
      const match = parsed.sheets?.find((item) => item.properties?.title === sheet.title);
      if (typeof match?.properties?.sheetId !== 'number') return null;
      ids[key] = match.properties.sheetId;
    }
    return ids;
  } catch {
    return null;
  }
}

export async function readFinanceSheet(sheet: FinanceSheetKey): Promise<FinanceStoreReadResult> {
  await requireFinanceAccess();

  const config = getFinanceStoreConfig();
  if (config.status === 'disabled') return { ok: false, code: 'disabled' };
  if (config.status !== 'ready') return { ok: false, code: 'not-configured' };

  const token = await fetchAccessToken(config.clientEmail, config.privateKey, READONLY_SCOPE);
  if (!token.ok) return { ok: false, code: token.code };

  const spec = FINANCE_SHEETS[sheet];
  const range = encodeURIComponent(`'${spec.title}'!A:ZZ`);
  const url =
    `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${range}` +
    '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.token}` },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'read-error' };
  }

  const bodyText = await response.text();
  if (!response.ok) return { ok: false, code: mapStatus(response.status) };

  try {
    const parsed = JSON.parse(bodyText) as { values?: unknown[][] };
    const values = Array.isArray(parsed.values) ? parsed.values : [];
    if (!hasFinanceHeaders(values, spec.headers)) {
      return { ok: false, code: 'schema-mismatch' };
    }
    return { ok: true, values };
  } catch {
    return { ok: false, code: 'read-error' };
  }
}

export async function writeFinanceMutations(
  mutations: readonly FinanceMutation[],
): Promise<FinanceStoreWriteResult> {
  await requireFinanceAccess();

  const config = getFinanceStoreConfig();
  if (config.status === 'disabled') return { ok: false, code: 'disabled' };
  if (config.status !== 'ready') return { ok: false, code: 'not-configured' };
  if (!config.writesEnabled) return { ok: false, code: 'writes-disabled' };
  if (mutations.length === 0) return { ok: true };

  const token = await fetchAccessToken(config.clientEmail, config.privateKey, SPREADSHEETS_SCOPE);
  if (!token.ok) return { ok: false, code: token.code };

  const sheetIds = await resolveSheetIds(config.spreadsheetId, token.token);
  if (!sheetIds) return { ok: false, code: 'schema-mismatch' };

  let requests: Record<string, unknown>[];
  try {
    requests = buildFinanceBatchRequests(sheetIds, mutations);
  } catch {
    return { ok: false, code: 'schema-mismatch' };
  }
  if (requests.length === 0) return { ok: true };

  const url = `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}:batchUpdate`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'write-error' };
  }

  await response.text();
  if (!response.ok) {
    if (response.status === 401) return { ok: false, code: 'auth-error' };
    if (response.status === 403) return { ok: false, code: 'permission-error' };
    return { ok: false, code: 'write-error' };
  }

  return { ok: true };
}
