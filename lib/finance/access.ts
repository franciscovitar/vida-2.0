import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';

/**
 * Finance data is available only to the main Vida allowlist.
 * Household-only identities never pass this DAL check.
 */
export async function requireFinanceAccess() {
  return requireAuthorizedSession();
}
