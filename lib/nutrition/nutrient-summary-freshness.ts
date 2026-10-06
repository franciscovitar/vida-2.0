import type { PlainCell } from '@/lib/data/plain';

export type NutritionNutrientSummaryFreshness = 'current' | 'stale' | 'unverifiable';

type Row = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionNutrientSummaryFreshnessRow {
  date: string;
  state: NutritionNutrientSummaryFreshness;
  latestEvidenceAt: string | null;
  earliestSummaryAt: string | null;
}

function stringValue(value: PlainCell | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function parseTimestamp(value: PlainCell | undefined): { raw: string; time: number } | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? { raw, time } : null;
}

function mutationTimestamp(
  row: Row,
  fields: readonly string[],
): { raw: string; time: number } | null {
  for (const field of fields) {
    const raw = stringValue(row[field]);
    if (!raw) continue;
    return parseTimestamp(raw);
  }
  return null;
}

function inRange(date: string | null, startDate: string, endDate: string): date is string {
  return Boolean(date && date >= startDate && date <= endDate);
}

export function auditNutritionNutrientSummaryFreshness(
  nutrientSummaryRows: readonly Row[],
  mealRows: readonly Row[],
  foodItemRows: readonly Row[],
  dailySummaryRows: readonly Row[],
  startDate: string,
  endDate: string,
  foodNutrientRows: readonly Row[] = [],
): NutritionNutrientSummaryFreshnessRow[] {
  const summaryDates = new Set(
    nutrientSummaryRows
      .map((row) => stringValue(row.date))
      .filter((date): date is string => inRange(date, startDate, endDate)),
  );

  const results: NutritionNutrientSummaryFreshnessRow[] = [];

  for (const date of [...summaryDates].sort()) {
    const summaryRows = nutrientSummaryRows.filter((row) => stringValue(row.date) === date);
    const summaryTimestamps = summaryRows.map((row) => parseTimestamp(row.updatedAt));
    const earliestSummary =
      summaryTimestamps.length > 0 && summaryTimestamps.every((value) => value !== null)
        ? summaryTimestamps.reduce((earliest, value) =>
            earliest === null || (value !== null && value.time < earliest.time) ? value : earliest,
          null as { raw: string; time: number } | null)
        : null;

    const meals = mealRows.filter((row) => stringValue(row.date) === date);
    const mealIds = new Set(
      meals
        .map((row) => stringValue(row.mealId))
        .filter((mealId): mealId is string => Boolean(mealId)),
    );
    const items = foodItemRows.filter((row) => {
      const mealId = stringValue(row.mealId);
      return Boolean(mealId && mealIds.has(mealId));
    });
    const dailyRows = dailySummaryRows.filter((row) => stringValue(row.date) === date);
    const nutrientRows = foodNutrientRows.filter((row) => stringValue(row.date) === date);

    const evidenceRows: Array<{ row: Row; fields: readonly string[] }> = [
      ...meals.map((row) => ({ row, fields: ['updatedAt', 'createdAt'] as const })),
      ...items.map((row) => ({ row, fields: ['updatedAt'] as const })),
      ...dailyRows.map((row) => ({ row, fields: ['updatedAt'] as const })),
      ...nutrientRows.map((row) => ({ row, fields: ['updatedAt'] as const })),
    ];

    if (!earliestSummary || evidenceRows.length === 0) {
      results.push({
        date,
        state: 'unverifiable',
        latestEvidenceAt: null,
        earliestSummaryAt: earliestSummary?.raw ?? null,
      });
      continue;
    }

    let latestEvidence: { raw: string; time: number } | null = null;
    let evidenceVerifiable = true;
    for (const evidence of evidenceRows) {
      const timestamp = mutationTimestamp(evidence.row, evidence.fields);
      if (!timestamp) {
        evidenceVerifiable = false;
        break;
      }
      if (!latestEvidence || timestamp.time > latestEvidence.time) latestEvidence = timestamp;
    }

    if (!evidenceVerifiable || !latestEvidence) {
      results.push({
        date,
        state: 'unverifiable',
        latestEvidenceAt: latestEvidence?.raw ?? null,
        earliestSummaryAt: earliestSummary.raw,
      });
      continue;
    }

    results.push({
      date,
      state: latestEvidence.time > earliestSummary.time ? 'stale' : 'current',
      latestEvidenceAt: latestEvidence.raw,
      earliestSummaryAt: earliestSummary.raw,
    });
  }

  return results;
}
