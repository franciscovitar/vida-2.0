import 'server-only';

import type { WorldFeedbackStorePort } from '@/lib/world/feedback';

/**
 * Phase 10 storage boundary.
 *
 * The deterministic feedback/UI layer is intentionally usable before a live
 * PostgreSQL provider is provisioned. Until the canonical World store is
 * connected, reads/writes fail closed while article rendering remains intact.
 */
export const worldFeedbackStorePort: WorldFeedbackStorePort = {
  async readCurrent() {
    return { ok: false, code: 'not-configured' };
  },
  async upsert() {
    return { ok: false, code: 'not-configured' };
  },
};
