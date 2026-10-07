export type PersonalShoppingEnv = Readonly<Record<string, string | undefined>>;

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

export type PersonalShoppingStoreIssue =
  | 'invalid-mode'
  | 'missing-spreadsheet-id'
  | 'invalid-spreadsheet-id'
  | 'missing-google-credentials';

export type PersonalShoppingStoreConfig =
  | { status: 'disabled' }
  | { status: 'not-configured'; issue: PersonalShoppingStoreIssue }
  | {
      status: 'ready';
      mode: 'google-sheets';
      spreadsheetId: string;
      clientEmail: string;
      privateKey: string;
      writesEnabled: boolean;
    };

function normalize(value: string | undefined): string {
  return value?.trim() ?? '';
}

function normalizePrivateKey(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

export function resolvePersonalShoppingStoreConfig(
  env: PersonalShoppingEnv,
): PersonalShoppingStoreConfig {
  const mode = normalize(env.PERSONAL_SHOPPING_STORE_MODE) || 'disabled';
  if (mode === 'disabled') return { status: 'disabled' };
  if (mode !== 'google-sheets') return { status: 'not-configured', issue: 'invalid-mode' };

  const spreadsheetId = normalize(env.GOOGLE_PERSONAL_SHOPPING_SPREADSHEET_ID);
  if (!spreadsheetId) return { status: 'not-configured', issue: 'missing-spreadsheet-id' };
  if (!SPREADSHEET_ID_PATTERN.test(spreadsheetId)) {
    return { status: 'not-configured', issue: 'invalid-spreadsheet-id' };
  }

  const clientEmail = normalize(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY ?? '';
  if (!clientEmail || !rawPrivateKey.trim()) {
    return { status: 'not-configured', issue: 'missing-google-credentials' };
  }

  return {
    status: 'ready',
    mode: 'google-sheets',
    spreadsheetId,
    clientEmail,
    privateKey: normalizePrivateKey(rawPrivateKey),
    writesEnabled: env.PERSONAL_SHOPPING_WRITES_ENABLED === 'true',
  };
}
