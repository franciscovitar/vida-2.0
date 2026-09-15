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
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
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
  return rows.filter((row) => (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active');
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
  return `${stringValue(row.canonicalFoodKey) ?? ''} ${stringValue(row.foodName) ?? ''}`.toLowerCase();
}

function splitFor(row: Row): EnergySplit {
  const value = identity(row);

  if (/olive_oil|cooking_oil|aceite|butter|manteca/.test(value)) {
    return { protein: 0, carbohydrate: 0, fat: 1, fiberPer100Kcal: 0 };
  }
  if (/honey|miel|jam|mermelada|sugar|azucar/.test(value)) {
    return { protein: 0.01, carbohydrate: 0.97, fat: 0.02, fiberPer100Kcal: 0.05 };
  }
  if (/avocado|palta/.test(value)) {
    return { protein: 0.05, carbohydrate: 0.2, fat: 0.75, fiberPer100Kcal: 2.1 };
  }
  if (/milanesa|breaded|empanad/.test(value)) {
    return { protein: 0.35, carbohydrate: 0.3, fat: 0.35, fiberPer100Kcal: 0.5 };
  }
  if (/chicken|pollo|fish|pescado|salmon|meat|carne|pork|cerdo/.test(value)) {
    return { protein: 0.55, carbohydrate: 0.03, fat: 0.42, fiberPer100Kcal: 0 };
  }
  if (/egg|huevo/.test(value)) {
    return { protein: 0.35, carbohydrate: 0.04, fat: 0.61, fiberPer100Kcal: 0 };
  }
  if (/cream_cheese|queso crema|muzzarella|mozzarella|cheese|queso/.test(value)) {
    return { protein: 0.12, carbohydrate: 0.08, fat: 0.8, fiberPer100Kcal: 0 };
  }
  if (/yogurt|yoghurt|milk|leche/.test(value)) {
    return { protein: 0.22, carbohydrate: 0.3, fat: 0.48, fiberPer100Kcal: 0 };
  }
  if (/mixed_nuts|classic_mix|mix clásico|mix clasico|nuts|nuez|almendra|mani|maní/.test(value)) {
    return { protein: 0.12, carbohydrate: 0.3, fat: 0.58, fiberPer100Kcal: 1.3 };
  }
  if (/chocolate|cacao|cookie|oreo|gallet/.test(value)) {
    return { protein: 0.06, carbohydrate: 0.42, fat: 0.52, fiberPer100Kcal: 1.8 };
  }
  if (/medialuna|pastry|alfajor|croissant/.test(value)) {
    return { protein: 0.08, carbohydrate: 0.48, fat: 0.44, fiberPer100Kcal: 0.5 };
  }
  if (/bread|pan|toast|tostad/.test(value)) {
    return { protein: 0.15, carbohydrate: 0.72, fat: 0.13, fiberPer100Kcal: 1.8 };
  }
  if (/pasta|fideo|tallarin|tallarín|rice|arroz|gnocchi|ñoqui/.test(value)) {
    return { protein: 0.14, carbohydrate: 0.78, fat: 0.08, fiberPer100Kcal: 0.9 };
  }
  if (/potato|papa/.test(value)) {
    return { protein: 0.09, carbohydrate: 0.88, fat: 0.03, fiberPer100Kcal: 1.8 };
  }
  if (/banana|apple|manzana|pear|pera|fruit|fruta/.test(value)) {
    return { protein: 0.04, carbohydrate: 0.93, fat: 0.03, fiberPer100Kcal: 2 };
  }
  if (/juice|jugo/.test(value)) {
    return { protein: 0.05, carbohydrate: 0.93, fat: 0.02, fiberPer100Kcal: 0.5 };
  }
  if (/spinach|espinaca|carrot|zanahoria|pepper|pimiento|tomato|tomate|salad|ensalada|arugula|rucula|rúcula/.test(value)) {
    return { protein: 0.15, carbohydrate: 0.75, fat: 0.1, fiberPer100Kcal: 3 };
  }
  if (/sushi|gohan/.test(value)) {
    return { protein: 0.18, carbohydrate: 0.58, fat: 0.24, fiberPer100Kcal: 0.6 };
  }

  return { protein: 0.2, carbohydrate: 0.45, fat: 0.35, fiberPer100Kcal: 0.5 };
}

function estimatedItemMacros(row: Row): {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
} {
  const energy = itemEnergy(row);
  const protein = numberValue(row.proteinGrams);
  const carbohydrate = numberValue(row.carbohydrateGrams);
  const fat = numberValue(row.fatGrams);
  const fiber = numberValue(row.fiberGrams);

  if (energy === null) {
    return { protein, carbohydrate, fat, fiber };
  }

  const split = splitFor(row);
  const knownEnergy = (protein ?? 0) * 4 + (carbohydrate ?? 0) * 4 + (fat ?? 0) * 9;
  const residual = Math.max(energy - knownEnergy, 0);
  const missing: MacroKey[] = [];
  if (protein === null) missing.push('protein');
  if (carbohydrate === null) missing.push('carbohydrate');
  if (fat === null) missing.push('fat');
  const shareTotal = missing.reduce((sum, key) => sum + split[key], 0);

  const allocate = (key: MacroKey, divisor: number, known: number | null): number | null => {
    if (known !== null) return known;
    if (shareTotal <= 0) return 0;
    return (residual * (split[key] / shareTotal)) / divisor;
  };

  return {
    protein: allocate('protein', 4, protein),
    carbohydrate: allocate('carbohydrate', 4, carbohydrate),
    fat: allocate('fat', 9, fat),
    fiber: fiber ?? Math.min((energy / 100) * split.fiberPer100Kcal, 15),
  };
}

function targetFor(key: NutritionMacroProgress['key'], target: NutritionTarget | null): number | null {
  if (!target) return null;
  if (key === 'protein') return target.proteinGrams;
  if (key === 'carbohydrate') return target.carbohydrateGrams;
  if (key === 'fat') return target.fatGrams;
  return target.fiberGrams;
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
  const itemRows = partitionNutritionFoodItemRows(rowsFromValues(itemsResult.values)).valid;
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
    estimateField: 'protein' | 'carbohydrate' | 'fat' | 'fiber';
  }> = [
    { key: 'protein', label: 'Proteína aprox.', column: 'proteinGrams', estimateField: 'protein' },
    {
      key: 'carbohydrate',
      label: 'Carbohidratos aprox.',
      column: 'carbohydrateGrams',
      estimateField: 'carbohydrate',
    },
    { key: 'fat', label: 'Grasas aprox.', column: 'fatGrams', estimateField: 'fat' },
    { key: 'fiber', label: 'Fibra aprox.', column: 'fiberGrams', estimateField: 'fiber' },
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
      coverage:
        items.length === 0
          ? 'none'
          : usable === items.length
            ? 'complete'
            : usable > 0
              ? 'partial'
              : 'none',
      knownItemCount: exactKnown,
      totalItemCount: items.length,
    } satisfies NutritionMacroProgress;
  });
}
