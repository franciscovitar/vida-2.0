import type { PlainCell } from '@/lib/data/plain';

type Row = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionRawIdentityIntegrityResult<MealRow extends Row, FoodItemRow extends Row> {
  mealRows: MealRow[];
  foodItemRows: FoodItemRow[];
  rejectedMealRows: MealRow[];
  rejectedFoodItemRows: FoodItemRow[];
  duplicateMealIdCount: number;
  duplicateFoodItemIdCount: number;
  missingMealIdCount: number;
  missingFoodItemIdCount: number;
  orphanFoodItemCount: number;
}

function stringValue(value: PlainCell | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function isActive(row: Row): boolean {
  return (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active';
}

function dateInRange(row: Row, startDate: string, endDate: string): boolean {
  const date = stringValue(row.date);
  return Boolean(date && date >= startDate && date <= endDate);
}

function duplicateKeys<T extends Row>(rows: readonly T[], field: string): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!isActive(row)) continue;
    const key = stringValue(row[field]);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export function sanitizeNutritionRawIdentity<MealRow extends Row, FoodItemRow extends Row>(
  mealRows: readonly MealRow[],
  foodItemRows: readonly FoodItemRow[],
): NutritionRawIdentityIntegrityResult<MealRow, FoodItemRow> {
  const duplicateMealIds = duplicateKeys(mealRows, 'mealId');
  const duplicateFoodItemIds = duplicateKeys(foodItemRows, 'foodItemId');

  const rejectedMealRows: MealRow[] = [];
  const usableMeals = mealRows.filter((row) => {
    if (!isActive(row)) return true;
    const mealId = stringValue(row.mealId);
    const usable = Boolean(mealId && !duplicateMealIds.has(mealId));
    if (!usable) rejectedMealRows.push(row);
    return usable;
  });

  const usableActiveMealIds = new Set(
    usableMeals
      .filter(isActive)
      .map((row) => stringValue(row.mealId))
      .filter((mealId): mealId is string => Boolean(mealId)),
  );

  const rejectedFoodItemRows: FoodItemRow[] = [];
  let missingFoodItemIdCount = 0;
  let orphanFoodItemCount = 0;

  const usableItems = foodItemRows.filter((row) => {
    if (!isActive(row)) return true;

    const foodItemId = stringValue(row.foodItemId);
    const mealId = stringValue(row.mealId);
    const hasIdentity = Boolean(foodItemId && !duplicateFoodItemIds.has(foodItemId));
    const hasParent = Boolean(mealId && usableActiveMealIds.has(mealId));

    if (!foodItemId) missingFoodItemIdCount += 1;
    if (!hasParent) orphanFoodItemCount += 1;

    const usable = hasIdentity && hasParent;
    if (!usable) rejectedFoodItemRows.push(row);
    return usable;
  });

  return {
    mealRows: usableMeals,
    foodItemRows: usableItems,
    rejectedMealRows,
    rejectedFoodItemRows,
    duplicateMealIdCount: duplicateMealIds.size,
    duplicateFoodItemIdCount: duplicateFoodItemIds.size,
    missingMealIdCount: rejectedMealRows.filter((row) => !stringValue(row.mealId)).length,
    missingFoodItemIdCount,
    orphanFoodItemCount,
  };
}

export function nutritionRawIdentityConflictDates<MealRow extends Row, FoodItemRow extends Row>(
  result: NutritionRawIdentityIntegrityResult<MealRow, FoodItemRow>,
  originalMealRows: readonly MealRow[],
): ReadonlySet<string> {
  const dates = new Set<string>();

  for (const row of result.rejectedMealRows) {
    if (!isActive(row)) continue;
    const date = stringValue(row.date);
    if (date) dates.add(date);
  }

  const activeMealDatesById = new Map<string, Set<string>>();
  for (const row of originalMealRows) {
    if (!isActive(row)) continue;
    const mealId = stringValue(row.mealId);
    const date = stringValue(row.date);
    if (!mealId || !date) continue;
    const current = activeMealDatesById.get(mealId) ?? new Set<string>();
    current.add(date);
    activeMealDatesById.set(mealId, current);
  }

  for (const row of result.rejectedFoodItemRows) {
    if (!isActive(row)) continue;
    const mealId = stringValue(row.mealId);
    if (!mealId) continue;
    for (const date of activeMealDatesById.get(mealId) ?? []) {
      dates.add(date);
    }
  }

  return dates;
}

export function nutritionRawIdentityHasConflictInWindow<
  MealRow extends Row,
  FoodItemRow extends Row,
>(
  result: NutritionRawIdentityIntegrityResult<MealRow, FoodItemRow>,
  originalMealRows: readonly MealRow[],
  startDate: string,
  endDate: string,
): boolean {
  return [...nutritionRawIdentityConflictDates(result, originalMealRows)].some(
    (date) => date >= startDate && date <= endDate,
  );
}
