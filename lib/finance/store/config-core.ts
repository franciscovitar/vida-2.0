import type { FinanceStoreConfigIssue, FinanceStoreReadiness } from '@/types/finance';

export type FinanceEnv = Record<string, string | undefined>;

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

function issue(value: FinanceStoreConfigIssue): FinanceStoreReadiness {
  return { status: 'not-configured', issue: value };
}

function normalize(value: string | undefined): string {
  return value?.trim() ?? '';
}

function normalizePrivateKey(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

/**
 * Pure, fail-closed Finance store configuration.
 *
 * Finance reuses Vida's existing Google service account but has its own dedicated
 * spreadsheet ID and independent write kill switch.
 */
export function resolveFinanceStoreConfig(env: FinanceEnv): FinanceStoreReadiness {
  const mode = normalize(env.FINANCE_STORE_MODE) || 'disabled';

  if (mode === 'disabled') return { status: 'disabled' };
  if (mode !== 'google-sheets') return issue('invalid-mode');

  const spreadsheetId = normalize(env.GOOGLE_FINANCE_SPREADSHEET_ID);
  if (!spreadsheetId) return issue('missing-spreadsheet-id');
  if (!SPREADSHEET_ID_PATTERN.test(spreadsheetId)) {
    return issue('invalid-spreadsheet-id');
  }

  const clientEmail = normalize(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY ?? '';
  if (!clientEmail || !rawPrivateKey.trim()) {
    return issue('missing-google-credentials');
  }

  return {
    status: 'ready',
    mode: 'google-sheets',
    spreadsheetId,
    clientEmail,
    privateKey: normalizePrivateKey(rawPrivateKey),
    writesEnabled: env.FINANCE_WRITES_ENABLED === 'true',
  };
}
