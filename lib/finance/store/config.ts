import 'server-only';

import { resolveFinanceStoreConfig } from '@/lib/finance/store/config-core';

/** Reads Finance store configuration only inside the server runtime. */
export function getFinanceStoreConfig() {
  return resolveFinanceStoreConfig(process.env);
}
