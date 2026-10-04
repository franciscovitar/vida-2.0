import 'server-only';

import { createWorldFeedbackPostgresPort } from '@/lib/world/feedback-postgres';

/**
 * Phase 10 storage boundary.
 *
 * Initialization is lazy. Builds and article reads remain safe when no database
 * URL is configured. Writes become available only when Vida receives the
 * isolated World PostgreSQL connection server-side.
 */
export const worldFeedbackStorePort = createWorldFeedbackPostgresPort();
