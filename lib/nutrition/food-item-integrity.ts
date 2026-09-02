import type { PlainCell } from '@/lib/data/plain';

export type NutritionFoodItemRow = Record<string, PlainCell>;

const FOOD_ITEM_CONFIDENCE = new Set(['high', 'medium', 'low', 'unknown']);
const FOOD_ITEM_STATUS = new Set(['active', 'void', 'superseded']);

const NUMERIC_FIELDS = [
  'amount',
  'weightGrams',
  'edibleFraction',
  'energyKcal',
  'energyKcalLow',
  'energyKcalHigh',
  'proteinGrams',
  'carbohydrateGrams',
  'fatGrams',
  'fiberGrams',
  'sodiumMg',
  'rawWeightGrams',
  'cookedWeightGrams',
] as const;

function optionalString(value: PlainCell): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isNumericCell(value: PlainCell): boolean {
  if (value === null) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed);
}

/**
 * Guardrail para evitar que una fila físicamente desalineada del Sheet contamine
 * calorías/macros. Tolera campos opcionales vacíos y filas legacy sin status.
 */
export function isNutritionFoodItemStructurallyValid(row: NutritionFoodItemRow): boolean {
  const confidenceRaw = row.confidence;
  if (confidenceRaw !== null) {
    const confidence = optionalString(confidenceRaw)?.toLowerCase();
    if (!confidence || !FOOD_ITEM_CONFIDENCE.has(confidence)) return false;
  }

  const statusRaw = row.status;
  if (statusRaw !== null) {
    const status = optionalString(statusRaw)?.toLowerCase();
    if (!status || !FOOD_ITEM_STATUS.has(status)) return false;
  }

  for (const field of NUMERIC_FIELDS) {
    if (!isNumericCell(row[field] ?? null)) return false;
  }

  return true;
}

/**
 * Separa filas válidas e inválidas sin convertir una anomalía histórica aislada
 * en la pérdida total de la pestaña. Las inválidas nunca llegan a agregaciones.
 */
export function partitionNutritionFoodItemRows<T extends NutritionFoodItemRow>(rows: readonly T[]): {
  valid: T[];
  invalid: T[];
} {
  const valid: T[] = [];
  const invalid: T[] = [];

  for (const row of rows) {
    (isNutritionFoodItemStructurallyValid(row) ? valid : invalid).push(row);
  }

  return { valid, invalid };
}
