import type { DailyOrientationView } from '@/types/daily-orientation-v2';

export function isDailyOrientationV2ReadFailure(
  readStatus: DailyOrientationView['readStatus'],
): boolean {
  return readStatus === 'unavailable' || readStatus === 'invalid';
}

/** Empty reads and read failures must communicate different evidence. */
export function dailyOrientationV2ReadNotice(
  orientation: Pick<DailyOrientationView, 'notice' | 'readStatus'>,
): string | null {
  if (orientation.notice) return orientation.notice;
  if (orientation.readStatus === 'unavailable')
    return 'La orientación diaria no está disponible. No se puede confirmar si hay una revisión guardada.';
  if (orientation.readStatus === 'invalid')
    return 'La orientación diaria no pudo verificarse. Las prioridades siguen sin confirmar.';
  return null;
}

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
