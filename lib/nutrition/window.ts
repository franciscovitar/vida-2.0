export type NutritionWindow = '7d' | '28d' | '90d';

export function normalizeNutritionWindow(value: string | string[] | undefined): NutritionWindow {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === '7d' || candidate === '28d' || candidate === '90d' ? candidate : '28d';
}

export function nutritionWindowDays(window: NutritionWindow): 7 | 28 | 90 {
  if (window === '7d') return 7;
  if (window === '90d') return 90;
  return 28;
}
