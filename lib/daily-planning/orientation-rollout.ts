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
 * The explicitly enabled minimal V2 surface must render even when the snapshot
 * is empty. Otherwise users see the legacy V1 screen instead of the truthful
 * "no analysis saved" state and cannot distinguish missing data from a feature
 * rollout. Production stays on V1 while its V2 flag is OFF.
 */
export function shouldRenderStagedDailyOrientationV2<
  T extends Pick<DailyOrientationView, 'readStatus' | 'generatedAt' | 'review'>,
>(flagEnabled: boolean, orientation: T | null): orientation is T {
  return flagEnabled && orientation !== null;
}
