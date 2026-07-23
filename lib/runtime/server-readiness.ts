import 'server-only';

import { buildRuntimeReadiness } from '@/lib/runtime/readiness';

/** Snapshot sanitizado del proceso actual. */
export function getRuntimeReadiness() {
  return buildRuntimeReadiness(process.env);
}
