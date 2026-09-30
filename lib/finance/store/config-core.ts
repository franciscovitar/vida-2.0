import type {
  FinanceStoreConfigIssue,
  FinanceStoreReadiness,
} from '@/types/finance';

export type FinanceEnv = Record<string, string | undefined>;

const OWNER_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SUPABASE_HOST_PATTERN = /^[a-z0-9]+\.supabase\.co$/;

function issue(value: FinanceStoreConfigIssue): FinanceStoreReadiness {
  return { status: 'not-configured', issue: value };
}

function normalize(value: string | undefined): string {
  return value?.trim() ?? '';
}

function validateSupabaseUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    if (!SUPABASE_HOST_PATTERN.test(parsed.hostname)) return null;
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Pure, fail-closed Finance store configuration.
 *
 * Secrets are returned only to the server-only wrapper. This module never reads
 * process.env by itself, which keeps it deterministic and testable.
 */
export function resolveFinanceStoreConfig(env: FinanceEnv): FinanceStoreReadiness {
  const rawMode = normalize(env.FINANCE_STORE_MODE);
  const mode = rawMode || 'disabled';

  if (mode === 'disabled') return { status: 'disabled' };
  if (mode !== 'supabase-rest') return issue('invalid-mode');

  const rawUrl = normalize(env.FINANCE_SUPABASE_URL);
  if (!rawUrl) return issue('missing-url');

  const baseUrl = validateSupabaseUrl(rawUrl);
  if (!baseUrl) return issue('invalid-url');

  const serviceRoleKey = normalize(env.FINANCE_SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) return issue('missing-service-role-key');

  const ownerKey = normalize(env.FINANCE_OWNER_KEY);
  if (!ownerKey) return issue('missing-owner-key');
  if (!OWNER_KEY_PATTERN.test(ownerKey)) return issue('invalid-owner-key');

  return {
    status: 'ready',
    mode: 'supabase-rest',
    baseUrl,
    serviceRoleKey,
    ownerKey,
    writesEnabled: env.FINANCE_WRITES_ENABLED === 'true',
  };
}
