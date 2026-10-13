/**
 * DEV-only Planning V2 single-attempt Sheets transport.
 *
 * This does NOT establish consent, exclusive writer ownership or durable
 * dispatch permission. No live credential-bound wrapper or UI/API route calls it.
 * Verify the actual DEV target schema before the POST. NEVER retry a POST even
 * after a timeout, 429/5xx, lost reply or apparent success.
 */
import {
  compilePlanningV2AppendCells,
  type PlanningV2AppendKind,
} from '@/lib/daily-planning/append-cells-v2';
import { SHEETS_BASE } from '@/lib/google/auth';
import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';

export type PlanningV2AppendAttempt = {
  status: 'blocked' | 'not-sent' | 'submitted-unconfirmed' | 'outcome-uncertain';
  postAttempts: 0 | 1;
  retryAllowed: false;
};
const blocked = (status: 'blocked' | 'not-sent'): PlanningV2AppendAttempt => ({
  status,
  postAttempts: 0,
  retryAllowed: false,
});
const outcome = (
  status: 'submitted-unconfirmed' | 'outcome-uncertain',
): PlanningV2AppendAttempt => ({
  status,
  postAttempts: 1,
  retryAllowed: false,
});

export interface PlanningV2DevSendEnv extends Readonly<Record<string, string | undefined>> {
  GOOGLE_SHEETS_TARGET?: string;
  GOOGLE_SHEETS_DEV_ID?: string;
  GOOGLE_SHEETS_PROD_ID?: string;
  DATA_SOURCE?: string;
  VERCEL_ENV?: string;
  /** Legacy Redis flag must stay OFF; cannot arm the selected Firestore path. */
  PLANNING_V2_DEV_LEDGER_ENABLED?: string;
  PLANNING_V2_DEV_FIRESTORE_LEDGER_ENABLED?: string;
  PLANNING_V2_DEV_GOOGLE_APPEND_ENABLED?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  PLANNING_V2_DEV_EXECUTION_SHEET_ID?: string;
  PLANNING_V2_DEV_ORIENTATION_SHEET_ID?: string;
  PLANNING_V2_DEV_ASSESSMENT_SHEET_ID?: string;
}
const TAB_IDS: Record<PlanningV2AppendKind, keyof PlanningV2DevSendEnv> = {
  execution: 'PLANNING_V2_DEV_EXECUTION_SHEET_ID',
  orientation: 'PLANNING_V2_DEV_ORIENTATION_SHEET_ID',
  assessment: 'PLANNING_V2_DEV_ASSESSMENT_SHEET_ID',
};

export type PlanningV2DevSendTarget = {
  workbookId: string;
  sheetId: number;
  kind: PlanningV2AppendKind;
};

/**
 * Config resolution is deterministic, does not use current-user input, and
 * refuses the legacy implicit DEV fallback. Sheet IDs must still be checked
 * against real DEV provider tab metadata before any flag is enabled.
 */
export function resolvePlanningV2DevSendTarget(
  kind: PlanningV2AppendKind,
  env: PlanningV2DevSendEnv = process.env,
): PlanningV2DevSendTarget | null {
  if (
    env.PLANNING_V2_DEV_GOOGLE_APPEND_ENABLED !== 'true' ||
    env.PLANNING_V2_DEV_FIRESTORE_LEDGER_ENABLED !== 'true' ||
    env.PLANNING_V2_DEV_LEDGER_ENABLED === 'true' ||
    env.DATA_SOURCE !== 'google' ||
    env.GOOGLE_SHEETS_TARGET !== 'dev' ||
    env.VERCEL_ENV !== 'preview' ||
    env.VERCEL_GIT_COMMIT_REF !== 'vida-qa' ||
    !Object.hasOwn(TAB_IDS, kind)
  )
    return null;
  const target = resolveSpreadsheetTarget(env);
  const prodId = env.GOOGLE_SHEETS_PROD_ID?.trim();
  if (
    !target.ok ||
    target.target !== 'dev' ||
    !target.spreadsheetId ||
    !prodId ||
    target.spreadsheetId === prodId
  )
    return null;
  const raw = env[TAB_IDS[kind]];
  if (typeof raw !== 'string' || !/^(?:0|[1-9][0-9]{0,9})$/.test(raw)) return null;
  const sheetId = Number(raw);
  if (!Number.isSafeInteger(sheetId) || sheetId < 0 || sheetId >= 2 ** 31) return null;
  return { workbookId: target.spreadsheetId, sheetId, kind };
}

const DEV_HEADERS = {
  execution: [
    'Observation ID', 'Fecha', 'Registrado en', 'Activity Type',
    'Domain', 'Entity Type', 'Canonical Ref', 'Actividad',
    'Minutos declarados', 'Inicio real', 'Execution State',
    'Evidence State', 'Progress Effect', 'Source Class',
    'Confianza', 'Evidence Refs JSON', 'Version',
  ],
  orientation: ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'],
  assessment: [
    'Snapshot ID', 'Assessment ID', 'Subject ID', 'Fecha evaluación',
    'Generado en', 'Payload JSON', 'Fuente', 'Versión',
  ],
} as const;
const DEV_TABS = {
  execution: 'Planning Execution V2',
  orientation: 'Daily Planning',
  assessment: 'Assessment Progress',
} as const;

/**
 * Read-only, last-moment schema/target check before the single POST. Two bounded
 * Google GETs: spreadsheet tab metadata and *header only* for the exact tab.
 * It is NOT an issuer, consent, lock, exactly-once proof or write authorization.
 * No provider JSON or header contents are logged or returned to the caller.
 */
async function checkedDevTabIsCurrent(
  target: PlanningV2DevSendTarget,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const name = DEV_TABS[target.kind];
  const expected = DEV_HEADERS[target.kind];
  const headers = { Authorization: `Bearer ${accessToken}` };
  async function readBounded(url: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const raw = await response.text();
      if (Buffer.byteLength(raw, 'utf8') > 16 * 1024) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const base = `${SHEETS_BASE}/${encodeURIComponent(target.workbookId)}`;
  const metadata = await readBounded(
    `${base}?fields=${encodeURIComponent('spreadsheetId,sheets(properties(sheetId,title,gridProperties(columnCount)))')}`,
  );
  if (
    !metadata ||
    metadata.spreadsheetId !== target.workbookId ||
    !Array.isArray(metadata.sheets)
  ) return false;
  const candidates = metadata.sheets.filter((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const properties = (entry as Record<string, unknown>).properties;
    return !!properties && typeof properties === 'object' &&
      (properties as Record<string, unknown>).sheetId === target.sheetId;
  });
  if (candidates.length !== 1) return false;
  const properties = (candidates[0] as { properties: {
    title?: unknown;
    gridProperties?: { columnCount?: unknown };
  }}).properties;
  if (
    properties.title !== name ||
    typeof properties.gridProperties?.columnCount !== 'number' ||
    !Number.isSafeInteger(properties.gridProperties.columnCount) ||
    properties.gridProperties.columnCount < expected.length
  ) return false;
  const range = `'${name.replace(/'/g, "''")}'!A1:${String.fromCharCode(64 + expected.length)}1`;
  const values = await readBounded(
    `${base}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  );
  if (!values || !Array.isArray(values.values) || values.values.length !== 1) return false;
  const firstRow = values.values[0];
  return Array.isArray(firstRow) &&
    firstRow.length === expected.length &&
    expected.every((header, index) => firstRow[index] === header);
}

/**
 * The only POST primitive, with all network dependencies injected for tests.
 * The optional token callback is invoked only after all local guards pass.
 * Authenticated actor, consent, canonical source and Firestore DISPATCHED must
 * be verified by a future independent server-only caller before invoking this.
 */
export async function attemptPlanningV2DevAppendOnce(input: {
  kind: PlanningV2AppendKind;
  row: readonly unknown[];
  env: PlanningV2DevSendEnv;
  token: () => Promise<string | null>;
  fetchImpl: typeof fetch;
}): Promise<PlanningV2AppendAttempt> {
  if (typeof input.token !== 'function' || typeof input.fetchImpl !== 'function') {
    return blocked('blocked');
  }
  const target = resolvePlanningV2DevSendTarget(input.kind, input.env);
  if (!target) return blocked('blocked');
  const compiled = compilePlanningV2AppendCells({
    kind: input.kind,
    row: input.row,
    target: 'dev',
    sheetId: target.sheetId,
  });
  if (!compiled.ok) return blocked('blocked');
  const body = JSON.stringify(compiled.request);
  if (Buffer.byteLength(body, 'utf8') > 32 * 1024) return blocked('blocked');

  let accessToken: string | null;
  try {
    accessToken = await input.token();
  } catch {
    return blocked('not-sent');
  }
  if (
    !accessToken ||
    typeof accessToken !== 'string' ||
    accessToken.length > 8192 ||
    /\s/.test(accessToken)
  )
    return blocked('not-sent');

  // Provider-verified read-only metadata: a numeric sheetId from env is not
  // proof that the actual DEV tab still has the expected name and headers.
  if (!(await checkedDevTabIsCurrent(target, accessToken, input.fetchImpl))) {
    return blocked('not-sent');
  }

  let attempted = false;
  try {
    const url = `${SHEETS_BASE}/${encodeURIComponent(target.workbookId)}:batchUpdate`;
    attempted = true;
    const response = await input.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    // Response body is neither trusted confirmation nor needed for a resend.
    // Do not log raw provider contents or identifiers.
    try {
      await response.body?.cancel();
    } catch {
      /* no body retention */
    }
    return outcome(response.ok ? 'submitted-unconfirmed' : 'outcome-uncertain');
  } catch {
    // Could have committed after a timeout / lost response. Never retry.
    return attempted ? outcome('outcome-uncertain') : blocked('not-sent');
  }
}
