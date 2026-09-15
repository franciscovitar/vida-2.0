import 'server-only';

import type { PlainCell } from '@/lib/data/plain';

import { partitionNutritionFoodItemRows } from './food-item-integrity';
import { readNutritionTabValues } from './sheets-read';
import type { NutritionMacroProgress, NutritionTarget } from './types';

type Row = Record<string, PlainCell>;
type MacroKey = 'protein' | 'carbohydrate' | 'fat';

type EnergySplit = {
  protein: number;
  carbohydrate: number;
  fat: number;
  fiberPer100Kcal: number;
};

type ItemMacroEstimate = {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
};

function rowsFromValues(values: readonly (readonly PlainCell[])[]): Row[] {
  if (values.length === 0) return [];

  const headers = values[0]!.map((cell) => String(cell ?? '').trim());
  return values.slice(1).map((cells) => {
    const row: Row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] ?? null;
    });
    return row;
  });
}

function stringValue(value: PlainCell): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function numberValue(value: PlainCell): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function activeRows(rows: readonly Row[]): Row[] {
  return rows.filter(
    (row) =>
      (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active',
  );
}

function itemEnergy(row: Row): number | null {
  const central = numberValue(row.energyKcal);
  if (central !== null) return central;

  const low = numberValue(row.energyKcalLow);
  const high = numberValue(row.energyKcalHigh);
  if (low !== null && high !== null) return (low + high) / 2;
  return low ?? high;
}

function identity(row: Row): string {
  const key = stringValue(row.canonicalFoodKey) ?? '';
  const name = stringValue(row.foodName) ?? '';
  return `${key} ${name}`.toLowerCase();
}

function split(
  protein: number,
  carbohydrate: number,
  fat: number,
  fiberPer100Kcal: number,
): EnergySplit {
  return { protein, carbohydrate, fat, fiberPer100Kcal };
}

function splitFor(row: Row): EnergySplit {
  const value = identity(row);

  if (/olive_oil|cooking_oil|aceite|butter|manteca/.test(value)) {
    return split(0, 0, 1, 0);
  }
  if (/honey|miel|jam|mermelada|sugar|azucar/.test(value)) {
    return split(0.01, 0.97, 0.02, 0.05);
  }
  if (/avocado|palta/.test(value)) return split(0.05, 0.2, 0.75, 2.1);
  if (/milanesa|breaded|empanad/.test(value)) {
    return split(0.35, 0.3, 0.35, 0.5);
  }
  if (/chicken|pollo|fish|pescado|salmon|meat|carne|pork|cerdo/.test(value)) {
    return split(0.55, 0.03, 0.42, 0);
  }
  if (/egg|huevo/.test(value)) return split(0.35, 0.04, 0.61, 0);
  if (/cream_cheese|queso crema|muzzarella|mozzarella|cheese|queso/.test(value)) {
    return split(0.12, 0.08, 0.8, 0);
  }
  if (/yogurt|yoghurt|milk|leche/.test(value)) {
    return split(0.22, 0.3, 0.48, 0);
  }
  if (
    /mixed_nuts|classic_mix|mix clásico|mix clasico|nuts|nuez|almendra|mani|maní/.test(
      value,
    )
  ) {
    return split(0.12, 0.3, 0.58, 1.3);
  }
  if (/chocolate|cacao|cookie|oreo|gallet/.test(value)) {
    return split(0.06, 0.42, 0.52, 1.8);
  }
  if (/medialuna|pastry|alfajor|croissant/.test(value)) {
    return split(0.08, 0.48, 0.44, 0.5);
  }
  if (/bread|pan|toast|tostad/.test(value)) {
    return split(0.15, 0.72, 0.13, 1.8);
  }
  if (/pasta|fideo|tallarin|tallarín|rice|arroz|gnocchi|ñoqui/.test(value)) {
    return split(0.14, 0.78, 0.08, 0.9);
  }
  if (/potato|papa/.test(value)) return split(0.09, 0.88, 0.03, 1.8);
  if (/banana|apple|manzana|pear|pera|fruit|fruta/.test(value)) {
    return split(0.04, 0.93, 0.03, 2);
  }
  if (/juice|jugo/.test(value)) return split(0.05, 0.93, 0.02, 0.5);
  if (
    /spinach|espinaca|carrot|zanahoria|pepper|pimiento|tomato|tomate|salad|ensalada|arugula|rucula|rúcula/.test(
      value,
    )
  ) {
    return split(0.15, 0.75, 0.1, 3);
  }
  if (/sushi|gohan/.test(value)) return split(0.18, 0.58, 0.24, 0.6);

  return split(0.2, 0.45, 0.35, 0.5);
}

function estimatedItemMacros(row: Row): ItemMacroEstimate {
  const energy = itemEnergy(row);
  const protein = numberValue(row.proteinGrams);
  const carbohydrate = numberValue(row.carbohydrateGrams);
  const fat = numberValue(row.fatGrams);
  const fiber = numberValue(row.fiberGrams);

  if (energy === null) return { protein, carbohydrate, fat, fiber };

  const energySplit = splitFor(row);
  const knownEnergy =
    (protein ?? 0) * 4 + (carbohydrate ?? 0) * 4 + (fat ?? 0) * 9;
  const residual = Math.max(energy - knownEnergy, 0);
  const missing: MacroKey[] = [];
  if (protein === null) missing.push('protein');
  if (carbohydrate === null) missing.push('carbohydrate');
  if (fat === null) missing.push('fat');

  const shareTotal = missing.reduce(
    (sum, key) => sum + energySplit[key],
    0,
  );
  const allocate = (
    key: MacroKey,
    divisor: number,
    known: number | null,
  ): number | null => {
    if (known !== null) return known;
    if (shareTotal <= 0) return 0;
    return (residual * (energySplit[key] / shareTotal)) / divisor;
  };

  return {
    protein: allocate('protein', 4, protein),
    carbohydrate: allocate('carbohydrate', 4, carbohydrate),
    fat: allocate('fat', 9, fat),
    fiber: fiber ?? Math.min((energy / 100) * energySplit.fiberPer100Kcal, 15),
  };
}

function targetFor(
  key: NutritionMacroProgress['key'],
  target: NutritionTarget | null,
): number | null {
  if (!target) return null;
  if (key === 'protein') return target.proteinGrams;
  if (key === 'carbohydrate') return target.carbohydrateGrams;
  if (key === 'fat') return target.fatGrams;
  return target.fiberGrams;
}

function coverageFor(
  totalItemCount: number,
  usableItemCount: number,
): NutritionMacroProgress['coverage'] {
  if (totalItemCount === 0) return 'none';
  if (usableItemCount === totalItemCount) return 'complete';
  if (usableItemCount > 0) return 'partial';
  return 'none';
}

export async function loadApproximateDayMacros(
  date: string,
  target: NutritionTarget | null,
): Promise<NutritionMacroProgress[]> {
  const [mealsResult, itemsResult] = await Promise.all([
    readNutritionTabValues('Meals'),
    readNutritionTabValues('Food Items'),
  ]);

  if (!mealsResult.ok || !itemsResult.ok) return [];

  const mealRows = activeRows(rowsFromValues(mealsResult.values));
  const itemRows = partitionNutritionFoodItemRows(
    rowsFromValues(itemsResult.values),
  ).valid;
  const mealIds = new Set(
    mealRows
      .filter((row) => stringValue(row.date) === date)
      .map((row) => stringValue(row.mealId))
      .filter((value): value is string => Boolean(value)),
  );
  const items = activeRows(itemRows).filter((row) => {
    const mealId = stringValue(row.mealId);
    return Boolean(mealId && mealIds.has(mealId));
  });

  const definitions: Array<{
    key: NutritionMacroProgress['key'];
    label: string;
    column: string;
    estimateField: keyof ItemMacroEstimate;
  }> = [
    {
      key: 'protein',
      label: 'Proteína aprox.',
      column: 'proteinGrams',
      estimateField: 'protein',
    },
    {
      key: 'carbohydrate',
      label: 'Carbohidratos aprox.',
      column: 'carbohydrateGrams',
      estimateField: 'carbohydrate',
    },
    {
      key: 'fat',
      label: 'Grasas aprox.',
      column: 'fatGrams',
      estimateField: 'fat',
    },
    {
      key: 'fiber',
      label: 'Fibra aprox.',
      column: 'fiberGrams',
      estimateField: 'fiber',
    },
  ];

  return definitions.map((definition) => {
    let total = 0;
    let usable = 0;
    let exactKnown = 0;

    for (const item of items) {
      const exact = numberValue(item[definition.column]);
      if (exact !== null) exactKnown += 1;

      const value = estimatedItemMacros(item)[definition.estimateField];
      if (value !== null && Number.isFinite(value)) {
        total += value;
        usable += 1;
      }
    }

    return {
      key: definition.key,
      label: definition.label,
      amount: usable > 0 ? total : null,
      target: targetFor(definition.key, target),
      unit: 'g',
      coverage: coverageFor(items.length, usable),
      knownItemCount: exactKnown,
      totalItemCount: items.length,
    } satisfies NutritionMacroProgress;
  });
}
