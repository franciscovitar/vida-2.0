import type { PlainCell } from '@/lib/data/plain';

import type { NutritionCoverage } from './types';

type Row = Readonly<Record<string, PlainCell>>;

export interface NutritionNutrientSummaryIntegrityResult {
  rows: Row[];
  downgradedRowCount: number;
  downgradedDateCount: number;
  unverifiableRowCount: number;
  suppressedSubtotalRowCount: number;
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

function suppressUnverifiableSubtotal(row: Row): Row {
  return {
    ...row,
    amount: null,
    amountLow: null,
    amountHigh: null,
    sourceCoverage: 'unknown',
    qualityFlags: appendQualityFlag(row.qualityFlags, 'vida_integrity_unverifiable'),
  };
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
  const mealsById = new Map<string, Row[]>();
  const itemsById = new Map<string, Row[]>();

  for (const meal of activeMeals) {
    const mealId = stringValue(meal.mealId);
    if (!mealId) continue;
    const rows = mealsById.get(mealId) ?? [];
    rows.push(meal);
    mealsById.set(mealId, rows);
  }

  for (const item of activeItems) {
    const foodItemId = stringValue(item.foodItemId);
    if (!foodItemId) continue;
    const rows = itemsById.get(foodItemId) ?? [];
    rows.push(item);
    itemsById.set(foodItemId, rows);
  }

  const downgradedDates = new Set<string>();
  let downgradedRowCount = 0;
  let unverifiableRowCount = 0;
  let suppressedSubtotalRowCount = 0;

  const rows = summaryRows.map((row) => {
    const date = stringValue(row.date);
    const nutrientKey = stringValue(row.nutrientKey);
    const declaredCoverage = coverageValue(row.sourceCoverage ?? row.coverage);

    if (
      !date ||
      !nutrientKey ||
      date < startDate ||
      date > endDate ||
      (declaredCoverage !== 'complete' && declaredCoverage !== 'partial')
    ) {
      return row;
    }

    const dayMeals = activeMeals.filter((meal) => stringValue(meal.date) === date);
    const mealIds = dayMeals
      .map((meal) => stringValue(meal.mealId))
      .filter((mealId): mealId is string => Boolean(mealId));
    const mealIdSet = new Set(mealIds);
    const hasInvalidMealIdentity =
      mealIds.length !== dayMeals.length || mealIdSet.size !== mealIds.length;

    const dayItems = activeItems.filter((item) => {
      const mealId = stringValue(item.mealId);
      return Boolean(mealId && mealIdSet.has(mealId));
    });
    const itemIds = dayItems
      .map((item) => stringValue(item.foodItemId))
      .filter((foodItemId): foodItemId is string => Boolean(foodItemId));
    const activeItemIds = new Set(itemIds);
    const hasInvalidItemIdentity =
      itemIds.length !== dayItems.length || activeItemIds.size !== itemIds.length;

    const candidates = activeNutrients.filter((nutrient) => {
      const foodItemId = stringValue(nutrient.foodItemId);
      return (
        stringValue(nutrient.nutrientKey) === nutrientKey &&
        (stringValue(nutrient.date) === date ||
          Boolean(foodItemId && activeItemIds.has(foodItemId)))
      );
    });

    const validLowerRows: Row[] = [];
    let invalidLowerRowCount = 0;

    for (const nutrient of candidates) {
      const foodItemId = stringValue(nutrient.foodItemId);
      const mealId = stringValue(nutrient.mealId);
      const linkedItems = foodItemId ? itemsById.get(foodItemId) ?? [] : [];
      const linkedItem = linkedItems.length === 1 ? linkedItems[0]! : null;
      const itemMealId = linkedItem ? stringValue(linkedItem.mealId) : null;
      const linkedMeals = itemMealId ? mealsById.get(itemMealId) ?? [] : [];
      const linkedMeal = linkedMeals.length === 1 ? linkedMeals[0]! : null;
      const lowerCoverage = coverageValue(nutrient.coverage);

      const valid =
        Boolean(foodItemId && activeItemIds.has(foodItemId)) &&
        Boolean(mealId && itemMealId === mealId) &&
        stringValue(nutrient.date) === date &&
        Boolean(linkedMeal && stringValue(linkedMeal.date) === date) &&
        hasDefensibleValue(nutrient) &&
        (lowerCoverage === 'complete' || lowerCoverage === 'partial');

      if (valid) validLowerRows.push(nutrient);
      else invalidLowerRowCount += 1;
    }

    const sourceIds = validLowerRows
      .map((nutrient) => stringValue(nutrient.foodItemId))
      .filter((foodItemId): foodItemId is string => Boolean(foodItemId));
    const uniqueSourceIds = new Set(sourceIds);
    const sourceItemCount = uniqueSourceIds.size;
    const declaredSourceCount = countValue(row.sourceFoodItemCount);
    const declaredUnquantifiedCount = countValue(row.unquantifiedRelevantItemCount);
    const hasDuplicateSources = uniqueSourceIds.size !== sourceIds.length;
    const hasHardLineageConflict =
      hasInvalidMealIdentity ||
      hasInvalidItemIdentity ||
      invalidLowerRowCount > 0 ||
      hasDuplicateSources;

    const suppress = () => {
      downgradedRowCount += 1;
      downgradedDates.add(date);
      unverifiableRowCount += 1;
      if (hasDefensibleValue(row)) suppressedSubtotalRowCount += 1;
      return suppressUnverifiableSubtotal(row);
    };

    if (hasHardLineageConflict) return suppress();

    if (declaredCoverage === 'partial') {
      if (declaredSourceCount !== null && declaredSourceCount !== sourceItemCount) {
        return suppress();
      }
      if (sourceItemCount === 0 && hasDefensibleValue(row)) {
        return suppress();
      }
      return row;
    }

    if (
      declaredSourceCount === null ||
      declaredUnquantifiedCount === null ||
      declaredSourceCount !== sourceItemCount ||
      activeItemIds.size === 0
    ) {
      return suppress();
    }

    if (
      sourceItemCount === activeItemIds.size &&
      declaredUnquantifiedCount === 0
    ) {
      return row;
    }

    downgradedRowCount += 1;
    downgradedDates.add(date);

    return {
      ...row,
      amount: sourceItemCount > 0 ? row.amount : null,
      amountLow: sourceItemCount > 0 ? row.amountLow : null,
      amountHigh: sourceItemCount > 0 ? row.amountHigh : null,
      sourceCoverage: sourceItemCount > 0 ? 'partial' : 'none',
      qualityFlags: appendQualityFlag(row.qualityFlags, 'vida_complete_claim_downgraded'),
    };
  });

  return {
    rows,
    downgradedRowCount,
    downgradedDateCount: downgradedDates.size,
    unverifiableRowCount,
    suppressedSubtotalRowCount,
  };
}
