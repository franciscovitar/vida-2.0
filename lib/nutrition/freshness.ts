export type NutritionFreshness = 'current' | 'stale' | 'historical' | 'unknown';

export interface NutritionFreshnessInput {
  dataDate: string;
  currentDate: string;
  hasRawIntake: boolean;
  rawAsOf: string | null;
  summaryAsOf: string | null;
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveNutritionFreshness(input: NutritionFreshnessInput): NutritionFreshness {
  if (input.dataDate !== input.currentDate) return 'historical';

  if (!input.hasRawIntake && input.summaryAsOf === null) return 'unknown';
  if (input.hasRawIntake && input.summaryAsOf === null) return 'stale';

  const raw = timestampMs(input.rawAsOf);
  const summary = timestampMs(input.summaryAsOf);

  if (raw !== null && summary !== null) return raw > summary ? 'stale' : 'current';
  if (summary !== null && !input.hasRawIntake) return 'current';

  return 'unknown';
}
