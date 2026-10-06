import type { PlainCell } from '@/lib/data/plain';

type Row = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionDailySummaryUniquenessResult<T extends Row> {
  rows: T[];
  duplicateDates: ReadonlySet<string>;
  duplicateDateCount: number;
  duplicateRowCount: number;
}

function stringValue(value: PlainCell | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function sanitizeNutritionDailySummaryUniqueness<T extends Row>(
  summaryRows: readonly T[],
  startDate: string,
  endDate: string,
): NutritionDailySummaryUniquenessResult<T> {
  const counts = new Map<string, number>();

  for (const row of summaryRows) {
    const date = stringValue(row.date);
    if (!date || date < startDate || date > endDate) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  const duplicateDates = new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([date]) => date),
  );

  let duplicateRowCount = 0;
  const rows = summaryRows.filter((row) => {
    const date = stringValue(row.date);
    if (!date || date < startDate || date > endDate || !duplicateDates.has(date)) {
      return true;
    }
    duplicateRowCount += 1;
    return false;
  });

  return {
    rows,
    duplicateDates,
    duplicateDateCount: duplicateDates.size,
    duplicateRowCount,
  };
}
