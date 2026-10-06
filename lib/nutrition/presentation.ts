export interface NutritionDisplayEstimate {
  value: number | null;
  approximate: boolean;
}

/**
 * Chooses a useful display point without mutating or discarding the source range.
 * The caller remains responsible for showing low/high when that uncertainty matters.
 */
export function nutritionDisplayPointEstimate(
  amount: number | null,
  low: number | null,
  high: number | null,
): NutritionDisplayEstimate {
  if (amount !== null && Number.isFinite(amount)) {
    return { value: amount, approximate: false };
  }

  if (low !== null && high !== null) {
    return { value: (low + high) / 2, approximate: true };
  }

  if (low !== null || high !== null) {
    return { value: low ?? high, approximate: true };
  }

  return { value: null, approximate: false };
}

export function nutritionDisplayDelta(
  amount: number | null,
  low: number | null,
  high: number | null,
  target: number | null,
): number | null {
  if (target === null || !Number.isFinite(target)) return null;
  const display = nutritionDisplayPointEstimate(amount, low, high);
  return display.value === null ? null : display.value - target;
}
