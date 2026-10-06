import type { PlainCell } from '@/lib/data/plain';

export type NutritionTargetIntegrityRow = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionTargetAmbiguityAudit {
  overlapPairCount: number;
  ambiguousRowCount: number;
}

export interface NutritionNutrientTargetAmbiguityAudit extends NutritionTargetAmbiguityAudit {
  ambiguousNutrientKeys: ReadonlySet<string>;
}

export function nutritionTargetString(value: PlainCell | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function nutritionTargetIsActiveLike(row: NutritionTargetIntegrityRow): boolean {
  const status = nutritionTargetString(row.status)?.toLowerCase();
  return status === null || status === 'active';
}

export function nutritionTargetCoversDate(row: NutritionTargetIntegrityRow, date: string): boolean {
  const from = nutritionTargetString(row.effectiveFrom);
  const to = nutritionTargetString(row.effectiveTo);
  return Boolean(from && from <= date && (!to || to >= date));
}

function intervalEnd(row: NutritionTargetIntegrityRow): string {
  return nutritionTargetString(row.effectiveTo) ?? '9999-12-31';
}

function overlapsWindow(
  a: NutritionTargetIntegrityRow,
  b: NutritionTargetIntegrityRow,
  startDate: string,
  endDate: string,
): boolean {
  const aFrom = nutritionTargetString(a.effectiveFrom);
  const bFrom = nutritionTargetString(b.effectiveFrom);
  if (!aFrom || !bFrom) return false;

  const overlapStart = [aFrom, bFrom, startDate].sort().at(-1)!;
  const overlapEnd = [intervalEnd(a), intervalEnd(b), endDate].sort()[0]!;
  return overlapStart <= overlapEnd;
}

export function nutritionTargetHasActiveAmbiguityForDate(
  rows: readonly NutritionTargetIntegrityRow[],
  date: string,
): boolean {
  return (
    rows.filter((row) => nutritionTargetIsActiveLike(row) && nutritionTargetCoversDate(row, date))
      .length > 1
  );
}

export function nutritionNutrientTargetHasActiveAmbiguityForDate(
  rows: readonly NutritionTargetIntegrityRow[],
  nutrientKey: string,
  date: string,
): boolean {
  return (
    rows.filter(
      (row) =>
        nutritionTargetString(row.nutrientKey) === nutrientKey &&
        nutritionTargetIsActiveLike(row) &&
        nutritionTargetCoversDate(row, date),
    ).length > 1
  );
}

export function auditNutritionTargetAmbiguity(
  rows: readonly NutritionTargetIntegrityRow[],
  startDate: string,
  endDate: string,
): NutritionTargetAmbiguityAudit {
  const active = rows.filter(nutritionTargetIsActiveLike);
  const ambiguousRows = new Set<NutritionTargetIntegrityRow>();
  let overlapPairCount = 0;

  for (let index = 0; index < active.length; index += 1) {
    for (let other = index + 1; other < active.length; other += 1) {
      const a = active[index]!;
      const b = active[other]!;
      if (!overlapsWindow(a, b, startDate, endDate)) continue;
      overlapPairCount += 1;
      ambiguousRows.add(a);
      ambiguousRows.add(b);
    }
  }

  return {
    overlapPairCount,
    ambiguousRowCount: ambiguousRows.size,
  };
}

export function auditNutritionNutrientTargetAmbiguity(
  rows: readonly NutritionTargetIntegrityRow[],
  startDate: string,
  endDate: string,
): NutritionNutrientTargetAmbiguityAudit {
  const active = rows.filter(nutritionTargetIsActiveLike);
  const ambiguousRows = new Set<NutritionTargetIntegrityRow>();
  const ambiguousNutrientKeys = new Set<string>();
  let overlapPairCount = 0;

  for (let index = 0; index < active.length; index += 1) {
    for (let other = index + 1; other < active.length; other += 1) {
      const a = active[index]!;
      const b = active[other]!;
      const aKey = nutritionTargetString(a.nutrientKey);
      const bKey = nutritionTargetString(b.nutrientKey);
      if (!aKey || aKey !== bKey) continue;
      if (!overlapsWindow(a, b, startDate, endDate)) continue;
      overlapPairCount += 1;
      ambiguousRows.add(a);
      ambiguousRows.add(b);
      ambiguousNutrientKeys.add(aKey);
    }
  }

  return {
    overlapPairCount,
    ambiguousRowCount: ambiguousRows.size,
    ambiguousNutrientKeys,
  };
}
