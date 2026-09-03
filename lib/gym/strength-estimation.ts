const EPLEY_MAX_COMPARABLE_REPS = 15;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Epley estimated 1RM used for Gym comparisons.
 * Sets above 15 reps stay outside the benchmark because the estimate becomes too speculative.
 */
export function estimateEpleyOneRepMax(loadKg: number, reps: number): number | null {
  if (!Number.isFinite(loadKg) || !Number.isInteger(reps)) return null;
  if (loadKg <= 0 || reps < 1 || reps > EPLEY_MAX_COMPARABLE_REPS) return null;
  return round(loadKg * (1 + reps / 30));
}

export function isEpleyComparableRepRange(reps: number | null): boolean {
  return reps !== null && Number.isInteger(reps) && reps >= 1 && reps <= EPLEY_MAX_COMPARABLE_REPS;
}

export const GYM_EPLEY_MAX_COMPARABLE_REPS = EPLEY_MAX_COMPARABLE_REPS;
