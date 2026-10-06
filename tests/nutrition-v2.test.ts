import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isNutritionFoodItemStructurallyValid,
  partitionNutritionFoodItemRows,
} from '@/lib/nutrition/food-item-integrity';
import { deriveNutritionFreshness } from '@/lib/nutrition/freshness';
import { selectNutritionMacros } from '@/lib/nutrition/macro-selection';
import { NUTRIENT_CATALOG } from '@/lib/nutrition/nutrient-catalog';
import {
  nutritionDisplayDelta,
  nutritionDisplayPointEstimate,
} from '@/lib/nutrition/presentation';
import { getNutritionSheetsConfig, getNutritionSpreadsheetId } from '@/lib/nutrition/sheets-config';
import {
  classifyNutritionTargetSemantics,
  nutritionProgressTarget,
} from '@/lib/nutrition/target-semantics';
import type { NutritionMacroProgress } from '@/lib/nutrition/types';

const FAKE_NUTRITION_ID = 'nutrition_sheet_example_1234567890';

const authEnv = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'nutrition-reader@example.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: 'line1\\nline2',
};

test('Nutrition V2 exige un spreadsheet dedicado y no cae al Sheet general', () => {
  const env = {
    ...authEnv,
    GOOGLE_SHEETS_DEV_ID: 'general_dev_sheet_example_123456',
    GOOGLE_SHEETS_PROD_ID: 'general_prod_sheet_example_12345',
    GOOGLE_GYM_SPREADSHEET_ID: 'gym_sheet_example_1234567890123',
  };

  assert.equal(getNutritionSpreadsheetId(env), null);
  assert.equal(getNutritionSheetsConfig(env), null);
});

test('Nutrition V2 resuelve solo su ID dedicado y normaliza la clave privada', () => {
  const config = getNutritionSheetsConfig({
    ...authEnv,
    GOOGLE_NUTRITION_SPREADSHEET_ID: FAKE_NUTRITION_ID,
  });

  assert.ok(config);
  assert.equal(config.spreadsheetId, FAKE_NUTRITION_ID);
  assert.equal(config.clientEmail, authEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  assert.equal(config.privateKey, 'line1\nline2');
});

test('el catálogo visual de micronutrientes cubre vitaminas, minerales y otros sin duplicados', () => {
  const keys = NUTRIENT_CATALOG.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.length >= 30);

  const groups = new Set(NUTRIENT_CATALOG.map((entry) => entry.group));
  assert.deepEqual(groups, new Set(['vitamin', 'mineral', 'other']));

  for (const required of [
    'vitamin-a',
    'vitamin-c',
    'vitamin-d',
    'vitamin-e',
    'vitamin-k',
    'vitamin-b12',
    'folate-b9',
    'calcium',
    'iron',
    'magnesium',
    'potassium',
    'selenium',
    'zinc',
    'iodine',
    'fiber',
    'omega-3-epa',
    'omega-3-dha',
  ]) {
    assert.ok(keys.includes(required), `${required} debe existir en el catálogo`);
  }
});

test('el catálogo no contiene valores personales ni objetivos nutricionales', () => {
  for (const entry of NUTRIENT_CATALOG) {
    assert.deepEqual(Object.keys(entry).sort(), ['group', 'key', 'name', 'unit']);
  }
});

test('Food Items válidos conservan números y estados canónicos', () => {
  assert.equal(
    isNutritionFoodItemStructurallyValid({
      confidence: 'high',
      status: 'active',
      energyKcal: 112,
      proteinGrams: 2.8,
      carbohydrateGrams: 9.5,
      fatGrams: 8.3,
      fiberGrams: 3.5,
    }),
    true,
  );
});

test('Food Items desalineados fallan cerrados antes de contaminar macros', () => {
  assert.equal(
    isNutritionFoodItemStructurallyValid({
      confidence: 'product-label',
      energyKcal: 'high',
      energyKcalLow: 424,
      energyKcalHigh: 424,
      proteinGrams: 424,
      status: null,
    }),
    false,
  );
});

test('una fila histórica inválida no borra las filas válidas actuales', () => {
  const current = {
    mealId: 'meal-current',
    confidence: 'high',
    status: 'active',
    energyKcal: 424,
    proteinGrams: 12.8,
    carbohydrateGrams: 68,
    fatGrams: 11.2,
    fiberGrams: 4.4,
  };
  const malformedHistorical = {
    mealId: 'meal-old',
    confidence: 'low',
    status: 'active',
    energyKcal: 345,
    rawWeightGrams: 'nota histórica desplazada',
  };

  const partition = partitionNutritionFoodItemRows([current, malformedHistorical]);
  assert.equal(partition.valid.length, 1);
  assert.equal(partition.valid[0], current);
  assert.equal(partition.invalid.length, 1);
  assert.equal(partition.invalid[0], malformedHistorical);
});

test('unknown nutricional permanece unknown en la capa de presentación', () => {
  assert.deepEqual(nutritionDisplayPointEstimate(null, null, null), {
    value: null,
    approximate: false,
  });
  assert.equal(nutritionDisplayDelta(null, null, null, 2500), null);
});

test('un rango puede usar midpoint visual sin dejar de ser aproximado', () => {
  assert.deepEqual(nutritionDisplayPointEstimate(null, 2400, 2800), {
    value: 2600,
    approximate: true,
  });
});

test('el delta energético conserva sobre-target y under-target sin clamp', () => {
  assert.equal(nutritionDisplayDelta(2670, null, null, 2500), 170);
  assert.equal(nutritionDisplayDelta(2300, null, null, 2500), -200);
  assert.equal(nutritionDisplayDelta(null, 2400, 2600, 2500), 0);
});

function macro(
  key: NutritionMacroProgress['key'],
  amount: number | null,
  coverage: NutritionMacroProgress['coverage'],
  approximate: boolean,
): NutritionMacroProgress {
  return {
    key,
    label: key,
    amount,
    target: null,
    unit: 'g',
    coverage,
    approximate,
    estimateQuality: approximate ? 'low' : 'high',
    knownItemCount: approximate ? 0 : amount === null ? 0 : 1,
    totalItemCount: 1,
  };
}

test('el fallback heurístico no reemplaza un macro canónico completo', () => {
  const selected = selectNutritionMacros(
    [macro('protein', 100, 'complete', false)],
    [macro('protein', 112, 'complete', true)],
  );
  assert.equal(selected[0]?.amount, 100);
  assert.equal(selected[0]?.approximate, false);
});

test('el fallback heurístico sí puede completar un macro canónico incompleto', () => {
  const selected = selectNutritionMacros(
    [macro('protein', 80, 'partial', false)],
    [macro('protein', 104, 'complete', true)],
  );
  assert.equal(selected[0]?.amount, 104);
  assert.equal(selected[0]?.approximate, true);
});

test('RDA y AI se tratan como adecuación, no como upper limit', () => {
  assert.equal(
    classifyNutritionTargetSemantics({
      target: 400,
      lowerTarget: null,
      upperTarget: 1000,
      basis: 'RDA / UL',
    }),
    'adequacy',
  );
  assert.equal(
    classifyNutritionTargetSemantics({
      target: 30,
      lowerTarget: null,
      upperTarget: null,
      basis: 'AI',
    }),
    'adequacy',
  );
});

test('un UL no se convierte en progreso hacia una meta aunque use targetAmount', () => {
  const target = {
    target: 2300,
    lowerTarget: null,
    upperTarget: null,
    basis: 'UL',
  };
  assert.equal(classifyNutritionTargetSemantics(target), 'upper-limit');
  assert.equal(nutritionProgressTarget(target), null);
});

test('un rango de referencia no se convierte en porcentaje de objetivo', () => {
  const target = {
    target: null,
    lowerTarget: 300,
    upperTarget: 400,
    basis: 'reference range',
  };
  assert.equal(classifyNutritionTargetSemantics(target), 'range');
  assert.equal(nutritionProgressTarget(target), null);
});

test('freshness detecta un resumen atrasado respecto del intake', () => {
  assert.equal(
    deriveNutritionFreshness({
      dataDate: '2026-10-06',
      currentDate: '2026-10-06',
      hasRawIntake: true,
      rawAsOf: '2026-10-06T12:10:00-03:00',
      summaryAsOf: '2026-10-06T12:05:00-03:00',
    }),
    'stale',
  );
  assert.equal(
    deriveNutritionFreshness({
      dataDate: '2026-10-06',
      currentDate: '2026-10-06',
      hasRawIntake: true,
      rawAsOf: '2026-10-06T12:05:00-03:00',
      summaryAsOf: '2026-10-06T12:10:00-03:00',
    }),
    'current',
  );
});

test('un día histórico no se etiqueta como stale por su antigüedad', () => {
  assert.equal(
    deriveNutritionFreshness({
      dataDate: '2026-10-05',
      currentDate: '2026-10-06',
      hasRawIntake: true,
      rawAsOf: '2026-10-05T21:00:00-03:00',
      summaryAsOf: '2026-10-05T21:01:00-03:00',
    }),
    'historical',
  );
});
