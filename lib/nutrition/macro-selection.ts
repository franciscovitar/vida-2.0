import type { NutritionMacroProgress } from './types';

const MACRO_ORDER: readonly NutritionMacroProgress['key'][] = [
  'protein',
  'carbohydrate',
  'fat',
  'fiber',
];

/**
 * Canonical item macros remain preferred whenever coverage is complete.
 * Approximate macros are a bounded fallback for incomplete canonical totals, never a blanket override.
 */
export function selectNutritionMacros(
  canonical: readonly NutritionMacroProgress[],
  approximate: readonly NutritionMacroProgress[],
): NutritionMacroProgress[] {
  const canonicalByKey = new Map(canonical.map((macro) => [macro.key, macro]));
  const approximateByKey = new Map(approximate.map((macro) => [macro.key, macro]));

  return MACRO_ORDER.flatMap((key) => {
    const exact = canonicalByKey.get(key);
    const fallback = approximateByKey.get(key);

    if (exact?.coverage === 'complete' && exact.amount !== null) return [exact];
    if (fallback?.amount !== null && fallback?.amount !== undefined) return [fallback];
    if (exact) return [exact];
    if (fallback) return [fallback];
    return [];
  });
}
