import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isNutritionFoodItemStructurallyValid,
  partitionNutritionFoodItemRows,
} from '@/lib/nutrition/food-item-integrity';
import { NUTRIENT_CATALOG } from '@/lib/nutrition/nutrient-catalog';
import { getNutritionSheetsConfig, getNutritionSpreadsheetId } from '@/lib/nutrition/sheets-config';

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
