import type { PlainCell } from '@/lib/data/plain';

import type { NutritionCoverage } from './types';

type Row = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionNutrientSummaryIntegrityResult {
  rows: Row[];
  downgradedRowCount: number;
  downgradedDateCount: number;
  unverifiableRowCount: number;
}

function stringValue(value: PlainCell | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function numberValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function countValue(value: PlainCell | undefined): number | null {
  const parsed = numberValue(value);
  if (parsed === null || parsed < 0 || !Number.isInteger(parsed)) return null;
  return parsed;
}

function coverageValue(value: PlainCell | undefined): NutritionCoverage {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === 'complete' ||
    normalized === 'partial' ||
    normalized === 'none' ||
    normalized === 'unknown'
    ? normalized
    : 'unknown';
}

function isActive(row: Row): boolean {
  return (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active';
}

function hasDefensibleValue(row: Row): boolean {
  return (
    numberValue(row.amount) !== null ||
    numberValue(row.amountLow) !== null ||
    numberValue(row.amountHigh) !== null
  );
}

function appendQualityFlag(value: PlainCell | undefined, flag: string): string {
  const current = stringValue(value);
  if (!current) return flag;
  const flags = current
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return flags.includes(flag) ? current : [...flags, flag].join(';');
}

function effectiveCoverageForCompleteClaim(input: {
  activeItemCount: number;
  sourceItemCount: number;
  declaredSourceCount: number | null;
  declaredUnquantifiedCount: number | null;
  hasDuplicateSources: boolean;
  hasInvalidItemIdentity: boolean;
  allSourcesComplete: boolean;
}): { coverage: NutritionCoverage; unverifiable: boolean } {
  if (
    input.declaredSourceCount === null ||
    input.declaredUnquantifiedCount === null ||
    input.hasDuplicateSources ||
    input.hasInvalidItemIdentity
  ) {
    return { coverage: 'unknown', unverifiable: true };
  }

  if (
    input.declaredSourceCount !== input.sourceItemCount ||
    input.declaredSourceCount > input.activeItemCount
  ) {
    return { coverage: 'unknown', unverifiable: true };
  }

  if (
    input.activeItemCount === 0 ||
    input.declaredUnquantifiedCount > 0 ||
    input.sourceItemCount < input.activeItemCount ||
    !input.allSourcesComplete
  ) {
    return {
      coverage: input.sourceItemCount > 0 ? 'partial' : 'none',
      unverifiable: false,
    };
  }

  return { coverage: 'complete', unverifiable: false };
}

export function sanitizeNutritionNutrientSummaryIntegrity(
  summaryRows: readonly Row[],
  mealRows: readonly Row[],
  foodItemRows: readonly Row[],
  foodNutrientRows: readonly Row[],
  startDate: string,
  endDate: string,
): NutritionNutrientSummaryIntegrityResult {
  const activeMeals = mealRows.filter(isActive);
  const activeItems = foodItemRows.filter(isActive);
  const activeNutrients = foodNutrientRows.filter(isActive);
  const downgradedDates = new Set<string>();
  let downgradedRowCount = 0;
  let unverifiableRowCount = 0;

  const rows = summaryRows.map((row) => {
    const date = stringValue(row.date);
    const nutrientKey = stringValue(row.nutrientKey);
    const declaredCoverage = coverageValue(row.sourceCoverage ?? row.coverage);

    if (
      !date ||
      !nutrientKey ||
      date < startDate ||
      date > endDate ||
      declaredCoverage !== 'complete'
    ) {
      return row;
    }

    const mealIds = new Set(
      activeMeals
        .filter((meal) => stringValue(meal.date) === date)
        .map((meal) => stringValue(meal.mealId))
        .filter((mealId): mealId is string => Boolean(mealId)),
    );
    const dayItems = activeItems.filter((item) => {
      const mealId = stringValue(item.mealId);
      return Boolean(mealId && mealIds.has(mealId));
    });
    const activeItemIds = new Set(
      dayItems
        .map((item) => stringValue(item.foodItemId))
        .filter((foodItemId): foodItemId is string => Boolean(foodItemId)),
    );

    const lowerRows = activeNutrients.filter((nutrient) => {
      const foodItemId = stringValue(nutrient.foodItemId);
      return (
        stringValue(nutrient.date) === date &&
        stringValue(nutrient.nutrientKey) === nutrientKey &&
        Boolean(foodItemId && activeItemIds.has(foodItemId)) &&
        hasDefensibleValue(nutrient)
      );
    });
    const sourceIds = lowerRows
      .map((nutrient) => stringValue(nutrient.foodItemId))
      .filter((foodItemId): foodItemId is string => Boolean(foodItemId));
    const uniqueSourceIds = new Set(sourceIds);
    const result = effectiveCoverageForCompleteClaim({
      activeItemCount: activeItemIds.size,
      sourceItemCount: uniqueSourceIds.size,
      declaredSourceCount: countValue(row.sourceFoodItemCount),
      declaredUnquantifiedCount: countValue(row.unquantifiedRelevantItemCount),
      hasDuplicateSources: uniqueSourceIds.size !== sourceIds.length,
      hasInvalidItemIdentity: activeItemIds.size !== dayItems.length,
      allSourcesComplete:
        lowerRows.length > 0 &&
        lowerRows.every((nutrient) => coverageValue(nutrient.coverage) === 'complete'),
    });

    if (result.coverage === 'complete') return row;

    downgradedRowCount += 1;
    downgradedDates.add(date);
    if (result.unverifiable) unverifiableRowCount += 1;

    return {
      ...row,
      sourceCoverage: result.coverage,
      qualityFlags: appendQualityFlag(
        row.qualityFlags,
        result.unverifiable
          ? 'vida_integrity_unverifiable'
          : 'vida_complete_claim_downgraded',
      ),
    };
  });

  return {
    rows,
    downgradedRowCount,
    downgradedDateCount: downgradedDates.size,
    unverifiableRowCount,
  };
}
