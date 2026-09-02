import assert from 'node:assert/strict';
import { test } from 'node:test';

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
