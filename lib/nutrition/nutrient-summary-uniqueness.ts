import type { PlainCell } from '@/lib/data/plain';

type SummaryRow = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionNutrientSummaryUniquenessResult<Row extends SummaryRow> {
  rows: Row[];
  duplicateKeyCount: number;
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

function isActive(row: SummaryRow): boolean {
  return (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active';
}

function logicalKey(row: SummaryRow, startDate: string, endDate: string): string | null {
  const date = stringValue(row.date);
  const nutrientKey = stringValue(row.nutrientKey);
  if (!date || !nutrientKey || date < startDate || date > endDate) return null;
  return `${date}\u0000${nutrientKey}`;
}

export function sanitizeNutritionNutrientSummaryUniqueness<Row extends SummaryRow>(
  summaryRows: readonly Row[],
  startDate: string,
  endDate: string,
): NutritionNutrientSummaryUniquenessResult<Row> {
  const activeRows = summaryRows.filter(isActive);
  const counts = new Map<string, number>();

  for (const row of activeRows) {
    const key = logicalKey(row, startDate, endDate);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const duplicateKeys = new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  );

  let duplicateRowCount = 0;
  const rows = activeRows.filter((row) => {
    const key = logicalKey(row, startDate, endDate);
    if (!key || !duplicateKeys.has(key)) return true;
    duplicateRowCount += 1;
    return false;
  });

  return {
    rows,
    duplicateKeyCount: duplicateKeys.size,
    duplicateRowCount,
  };
}
