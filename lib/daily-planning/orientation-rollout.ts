import type { DailyOrientationView } from '@/types/daily-orientation-v2';

/**
 * During staged migration only a *confirmed empty* V2 read can use V1.
 * Auth/permission/network/schema/invalid-row failures must be visible in V2,
 * not silently masked as "no orientation yet".
 *
 * This is NOT an after-cutover rollback authorization; it does not activate
 * any flags or fallback in Production by itself.
 */
export function shouldRenderStagedDailyOrientationV2<
  T extends Pick<DailyOrientationView, 'readStatus' | 'generatedAt' | 'review'>,
>(flagEnabled: boolean, orientation: T | null): orientation is T {
  return flagEnabled && orientation !== null && orientation.readStatus !== 'empty';
}
