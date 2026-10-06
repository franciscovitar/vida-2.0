import type { PlainCell } from '@/lib/data/plain';

type InsightRow = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionAiInsightUniquenessResult<Row extends InsightRow> {
  rows: Row[];
  duplicateGroupKeys: ReadonlySet<string>;
  duplicateGroupCount: number;
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

function isActive(row: InsightRow): boolean {
  return (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active';
}

export function nutritionAiInsightGroupKey(row: InsightRow): string | null {
  const rawCategory = stringValue(row.category)?.toLowerCase();
  const category =
    rawCategory === 'antioxidants' ||
    rawCategory === 'anti-inflammatory' ||
    rawCategory === 'improvement' ||
    rawCategory === 'pattern'
      ? rawCategory
      : null;
  const window = stringValue(row.window)?.toLowerCase();
  if (!category || !window) return null;
  return `${category}\u0000${window}`;
}

export function auditNutritionAiInsightUniqueness<Row extends InsightRow>(
  insightRows: readonly Row[],
): NutritionAiInsightUniquenessResult<Row> {
  const activeRows = insightRows.filter(isActive);
  const counts = new Map<string, number>();

  for (const row of activeRows) {
    const key = nutritionAiInsightGroupKey(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const duplicateGroupKeys = new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  );

  let duplicateRowCount = 0;
  const rows = activeRows.filter((row) => {
    const key = nutritionAiInsightGroupKey(row);
    if (!key || !duplicateGroupKeys.has(key)) return true;
    duplicateRowCount += 1;
    return false;
  });

  return {
    rows,
    duplicateGroupKeys,
    duplicateGroupCount: duplicateGroupKeys.size,
    duplicateRowCount,
  };
}
