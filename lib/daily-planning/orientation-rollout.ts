import type { DailyOrientationView } from '@/types/daily-orientation-v2';

/**
 * During the staged migration, only switch to V2 when an actual orientation
 * snapshot exists. An empty/unavailable V2 view does not certify a persisted
 * daily orientation.
 *
 * This is deliberately not an after-cutover rule: removing V1 fallback needs
 * a separate authorized rollout checkpoint.
 */
export function shouldRenderStagedDailyOrientationV2<
  T extends Pick<DailyOrientationView, 'generatedAt' | 'review'>,
>(flagEnabled: boolean, orientation: T | null): orientation is T {
  return (
    flagEnabled &&
    orientation !== null &&
    orientation.generatedAt !== null &&
    orientation.review !== null
  );
}
