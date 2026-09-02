import type { NutrientGroup } from './types';

export interface NutrientCatalogEntry {
  key: string;
  name: string;
  group: NutrientGroup;
  unit: string;
}

/**
 * Catálogo visual, no fuente de valores ni de objetivos.
 * Los amounts/targets reales deben venir del store canónico de Nutrition Intelligence.
 */
export const NUTRIENT_CATALOG: readonly NutrientCatalogEntry[] = [
  { key: 'vitamin-a', name: 'Vitamina A', group: 'vitamin', unit: 'µg RAE' },
  { key: 'vitamin-c', name: 'Vitamina C', group: 'vitamin', unit: 'mg' },
  { key: 'vitamin-d', name: 'Vitamina D', group: 'vitamin', unit: 'µg' },
  { key: 'vitamin-e', name: 'Vitamina E', group: 'vitamin', unit: 'mg' },
  { key: 'vitamin-k', name: 'Vitamina K', group: 'vitamin', unit: 'µg' },
  { key: 'thiamin-b1', name: 'B1 · Tiamina', group: 'vitamin', unit: 'mg' },
  { key: 'riboflavin-b2', name: 'B2 · Riboflavina', group: 'vitamin', unit: 'mg' },
  { key: 'niacin-b3', name: 'B3 · Niacina', group: 'vitamin', unit: 'mg' },
  { key: 'pantothenic-acid-b5', name: 'B5 · Ácido pantoténico', group: 'vitamin', unit: 'mg' },
  { key: 'vitamin-b6', name: 'Vitamina B6', group: 'vitamin', unit: 'mg' },
  { key: 'biotin-b7', name: 'B7 · Biotina', group: 'vitamin', unit: 'µg' },
  { key: 'folate-b9', name: 'B9 · Folato', group: 'vitamin', unit: 'µg DFE' },
  { key: 'vitamin-b12', name: 'Vitamina B12', group: 'vitamin', unit: 'µg' },
  { key: 'choline', name: 'Colina', group: 'vitamin', unit: 'mg' },
  { key: 'calcium', name: 'Calcio', group: 'mineral', unit: 'mg' },
  { key: 'copper', name: 'Cobre', group: 'mineral', unit: 'mg' },
  { key: 'iron', name: 'Hierro', group: 'mineral', unit: 'mg' },
  { key: 'magnesium', name: 'Magnesio', group: 'mineral', unit: 'mg' },
  { key: 'manganese', name: 'Manganeso', group: 'mineral', unit: 'mg' },
  { key: 'phosphorus', name: 'Fósforo', group: 'mineral', unit: 'mg' },
  { key: 'potassium', name: 'Potasio', group: 'mineral', unit: 'mg' },
  { key: 'selenium', name: 'Selenio', group: 'mineral', unit: 'µg' },
  { key: 'sodium', name: 'Sodio', group: 'mineral', unit: 'mg' },
  { key: 'zinc', name: 'Zinc', group: 'mineral', unit: 'mg' },
  { key: 'iodine', name: 'Yodo', group: 'mineral', unit: 'µg' },
  { key: 'chromium', name: 'Cromo', group: 'mineral', unit: 'µg' },
  { key: 'molybdenum', name: 'Molibdeno', group: 'mineral', unit: 'µg' },
  { key: 'fiber', name: 'Fibra', group: 'other', unit: 'g' },
  { key: 'omega-3-ala', name: 'Omega-3 · ALA', group: 'other', unit: 'g' },
  { key: 'omega-3-epa', name: 'Omega-3 · EPA', group: 'other', unit: 'mg' },
  { key: 'omega-3-dha', name: 'Omega-3 · DHA', group: 'other', unit: 'mg' },
  { key: 'omega-6-la', name: 'Omega-6 · LA', group: 'other', unit: 'g' },
  { key: 'saturated-fat', name: 'Grasa saturada', group: 'other', unit: 'g' },
  { key: 'added-sugar', name: 'Azúcares añadidos', group: 'other', unit: 'g' },
  { key: 'cholesterol', name: 'Colesterol', group: 'other', unit: 'mg' },
  { key: 'water', name: 'Agua', group: 'other', unit: 'ml' },
] as const;

export function nutrientCatalogEntry(key: string): NutrientCatalogEntry | undefined {
  return NUTRIENT_CATALOG.find((entry) => entry.key === key);
}
