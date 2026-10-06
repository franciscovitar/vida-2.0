import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeNutritionRawDayEnergy } from '@/lib/nutrition/day-energy';
import {
  isNutritionFoodItemStructurallyValid,
  partitionNutritionFoodItemRows,
} from '@/lib/nutrition/food-item-integrity';
import { deriveNutritionFreshness } from '@/lib/nutrition/freshness';
import {
  buildNutritionRawDayFacts,
  reconcileNutritionHistoryWithRaw,
} from '@/lib/nutrition/history-reconciliation';
import { buildNutritionNutrientWindow } from '@/lib/nutrition/nutrient-window';
import { NUTRIENT_CATALOG } from '@/lib/nutrition/nutrient-catalog';
import {
  nutritionComparableProgressPercent,
  nutritionDisplayDelta,
  nutritionDisplayDeltaToTarget,
  nutritionDisplayPointEstimate,
} from '@/lib/nutrition/presentation';
import { getNutritionSheetsConfig, getNutritionSpreadsheetId } from '@/lib/nutrition/sheets-config';
import {
  classifyNutritionTargetSemantics,
  nutritionProgressTarget,
} from '@/lib/nutrition/target-semantics';
import {
  resolveNutritionHistoricalEnergyTarget,
  selectNutritionTargetRowForDate,
} from '@/lib/nutrition/target-history';
import { normalizeNutritionWindow, nutritionWindowDays } from '@/lib/nutrition/window';

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

test('energía cruda completa prevalece con suma reproducible desde Food Items', () => {
  assert.deepEqual(
    summarizeNutritionRawDayEnergy([
      { energyKcal: 400, confidence: 'high' },
      { energyKcal: 600, energyKcalLow: 550, energyKcalHigh: 650, confidence: 'high' },
    ]),
    {
      amount: 1000,
      low: 950,
      high: 1050,
      coverage: 'complete',
      quality: 'high',
      quantifiedItemCount: 2,
      totalItemCount: 2,
      lowConfidenceItemCount: 0,
    },
  );
});

test('un item energético desconocido vuelve parcial al día sin inventar su aporte', () => {
  assert.deepEqual(
    summarizeNutritionRawDayEnergy([
      { energyKcal: 400, confidence: 'high' },
      { energyKcal: null, energyKcalLow: null, energyKcalHigh: null, confidence: 'low' },
    ]),
    {
      amount: null,
      low: 400,
      high: 400,
      coverage: 'partial',
      quality: 'high',
      quantifiedItemCount: 1,
      totalItemCount: 2,
      lowConfidenceItemCount: 1,
    },
  );
});

test('un rango energético completo puede ser autoridad sin fabricar valor central', () => {
  assert.deepEqual(
    summarizeNutritionRawDayEnergy([
      { energyKcal: null, energyKcalLow: 500, energyKcalHigh: 700, confidence: 'medium' },
    ]),
    {
      amount: null,
      low: 500,
      high: 700,
      coverage: 'complete',
      quality: 'medium',
      quantifiedItemCount: 1,
      totalItemCount: 1,
      lowConfidenceItemCount: 0,
    },
  );
});

test('Tendencias reemplaza un Daily Summary histórico viejo con autoridad cruda', () => {
  const rawDays = buildNutritionRawDayFacts(
    [{ mealId: 'm1', date: '2026-10-01', status: 'active' }],
    [
      {
        mealId: 'm1',
        status: 'active',
        energyKcal: 400,
        proteinGrams: 30,
        carbohydrateGrams: 40,
        fatGrams: 10,
        fiberGrams: 5,
        confidence: 'high',
      },
    ],
    [],
    '2026-10-06',
  );
  const history = reconcileNutritionHistoryWithRaw(
    [
      {
        date: '2026-10-01',
        energyKcal: 999,
        energyKcalLow: 999,
        energyKcalHigh: 999,
        targetDecisionId: 'old-target',
        energyTargetKcal: 2500,
        energyTargetKcalLow: null,
        energyTargetKcalHigh: null,
        estimateQuality: 'low',
        energyCoverage: 'complete',
        macroCoverage: 'complete',
        trackedMealCount: 1,
        lowConfidenceItemCount: 1,
      },
    ],
    [
      {
        decisionId: 'old-target',
        effectiveFrom: '2026-09-01',
        effectiveTo: '2026-10-02',
        status: 'superseded',
        energyTargetKcal: 2500,
      },
    ],
    rawDays,
    '2026-10-06',
    '2026-10-06',
  );

  assert.equal(history[0]?.energyKcal, 400);
  assert.equal(history[0]?.energyCoverage, 'complete');
  assert.equal(history[0]?.macroCoverage, 'complete');
  assert.equal(history[0]?.estimateQuality, 'high');
  assert.equal(history[0]?.targetDecisionId, 'old-target');
});

test('un día crudo aparece en Tendencias aunque Daily Summary todavía no exista', () => {
  const rawDays = buildNutritionRawDayFacts(
    [{ mealId: 'm2', date: '2026-10-05', status: 'active' }],
    [{ mealId: 'm2', status: 'active', energyKcal: 700, confidence: 'medium' }],
    [],
    '2026-10-06',
  );
  const history = reconcileNutritionHistoryWithRaw(
    [],
    [
      {
        decisionId: 'target-current',
        effectiveFrom: '2026-10-01',
        status: 'active',
        energyTargetKcal: 2600,
      },
    ],
    rawDays,
    '2026-10-06',
    '2026-10-06',
  );

  assert.equal(history.length, 1);
  assert.equal(history[0]?.date, '2026-10-05');
  assert.equal(history[0]?.energyKcal, 700);
  assert.equal(history[0]?.targetDecisionId, 'target-current');
});

test('items inválidos o comidas sin items impiden cobertura completa histórica', () => {
  const rawDays = buildNutritionRawDayFacts(
    [
      { mealId: 'm1', date: '2026-10-04', status: 'active' },
      { mealId: 'm2', date: '2026-10-04', status: 'active' },
      { mealId: 'm3', date: '2026-10-04', status: 'active' },
    ],
    [
      {
        mealId: 'm1',
        status: 'active',
        energyKcal: 500,
        proteinGrams: 25,
        carbohydrateGrams: 50,
        fatGrams: 20,
        fiberGrams: 6,
        confidence: 'high',
      },
    ],
    [{ mealId: 'm2', status: 'active', energyKcal: 'fila-desalineada' }],
    '2026-10-06',
  );
  const day = rawDays.get('2026-10-04');

  assert.ok(day);
  assert.equal(day.unknownContributionCount, 2);
  assert.equal(day.energy.coverage, 'partial');
  assert.equal(day.energy.totalItemCount, 3);
  assert.equal(day.macroCoverage, 'partial');
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

test('los porcentajes contra meta requieren cobertura completa', () => {
  assert.equal(nutritionComparableProgressPercent(80, 100, 'complete'), 80);
  assert.equal(nutritionComparableProgressPercent(80, 100, 'partial'), null);
  assert.equal(nutritionComparableProgressPercent(80, 100, 'none'), null);
  assert.equal(nutritionComparableProgressPercent(null, 100, 'complete'), null);
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

test('Tendencias usa 28D por defecto y acepta sólo ventanas soportadas', () => {
  assert.equal(normalizeNutritionWindow(undefined), '28d');
  assert.equal(normalizeNutritionWindow('cualquier-cosa'), '28d');
  assert.equal(normalizeNutritionWindow('7d'), '7d');
  assert.equal(normalizeNutritionWindow('90d'), '90d');
  assert.equal(nutritionWindowDays('28d'), 28);
});

test('Nutrientes promedia sólo días completos y detecta una señal persistente de adecuación', () => {
  const summary = [
    {
      date: '2026-10-01',
      nutrientKey: 'magnesium',
      amount: 300,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-02',
      nutrientKey: 'magnesium',
      amount: 350,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-03',
      nutrientKey: 'magnesium',
      amount: 450,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-04',
      nutrientKey: 'magnesium',
      amount: 100,
      sourceCoverage: 'partial',
      confidence: 'medium',
    },
    {
      date: '2026-10-05',
      nutrientKey: 'magnesium',
      amount: 320,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
  ];
  const targets = [
    {
      decisionId: 'mg-rda',
      effectiveFrom: '2026-01-01',
      status: 'active',
      nutrientKey: 'magnesium',
      targetAmount: 400,
      unit: 'mg',
      basis: 'RDA',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, targets, '2026-10-05', 7);
  const magnesium = data.nutrients.find((nutrient) => nutrient.key === 'magnesium');

  assert.ok(magnesium);
  assert.equal(magnesium.completeDays, 4);
  assert.equal(magnesium.partialDays, 1);
  assert.equal(magnesium.averageAmount, 355);
  assert.equal(magnesium.evaluatedDays, 4);
  assert.equal(magnesium.attentionDays, 3);
  assert.equal(magnesium.attentionKind, 'below-reference');
  assert.equal(data.attention[0]?.key, 'magnesium');
});

test('Nutrientes interpreta UL como días por encima del límite y no como meta a alcanzar', () => {
  const summary = [
    {
      date: '2026-10-01',
      nutrientKey: 'sodium',
      amount: 2500,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-02',
      nutrientKey: 'sodium',
      amount: 2000,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-03',
      nutrientKey: 'sodium',
      amount: 2600,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
  ];
  const targets = [
    {
      decisionId: 'sodium-ul',
      effectiveFrom: '2026-01-01',
      status: 'active',
      nutrientKey: 'sodium',
      targetAmount: 2300,
      unit: 'mg',
      basis: 'UL',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, targets, '2026-10-03', 7);
  const sodium = data.nutrients.find((nutrient) => nutrient.key === 'sodium');

  assert.ok(sodium);
  assert.equal(sodium.attentionKind, 'above-limit');
  assert.equal(sodium.attentionDays, 2);
  assert.equal(sodium.evaluatedDays, 3);
  assert.equal(data.attention[0]?.key, 'sodium');
});

test('Nutrientes no infiere semántica desde targetAmount del resumen si falta Nutrient Targets', () => {
  const summary = [
    {
      date: '2026-10-01',
      nutrientKey: 'sodium',
      amount: 2500,
      targetAmount: 2300,
      targetDecisionId: 'sodium-ul',
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-02',
      nutrientKey: 'sodium',
      amount: 2600,
      targetAmount: 2300,
      targetDecisionId: 'sodium-ul',
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-03',
      nutrientKey: 'sodium',
      amount: 2700,
      targetAmount: 2300,
      targetDecisionId: 'sodium-ul',
      sourceCoverage: 'complete',
      confidence: 'high',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, [], '2026-10-03', 7);
  const sodium = data.nutrients.find((nutrient) => nutrient.key === 'sodium');

  assert.ok(sodium);
  assert.equal(sodium.evaluatedDays, 0);
  assert.equal(sodium.attentionDays, 0);
  assert.equal(sodium.currentReference, null);
  assert.equal(data.attention.length, 0);
});

test('Nutrientes no eleva una señal aislada si afecta menos de la mitad de los días evaluables', () => {
  const summary = Array.from({ length: 10 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    nutrientKey: 'magnesium',
    amount: index < 2 ? 300 : 450,
    sourceCoverage: 'complete',
    confidence: 'high',
  }));
  const targets = [
    {
      decisionId: 'mg-rda',
      effectiveFrom: '2026-01-01',
      status: 'active',
      nutrientKey: 'magnesium',
      targetAmount: 400,
      unit: 'mg',
      basis: 'RDA',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, targets, '2026-09-10', 28);
  const magnesium = data.nutrients.find((nutrient) => nutrient.key === 'magnesium');

  assert.ok(magnesium);
  assert.equal(magnesium.evaluatedDays, 10);
  assert.equal(magnesium.attentionDays, 2);
  assert.equal(magnesium.attentionRate, 0.2);
  assert.equal(data.attention.some((nutrient) => nutrient.key === 'magnesium'), false);
});

test('Nutrientes puede detectar un UL aun cuando la misma decisión también tiene RDA', () => {
  const summary = [
    {
      date: '2026-10-01',
      nutrientKey: 'magnesium',
      amount: 900,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-02',
      nutrientKey: 'magnesium',
      amount: 850,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-03',
      nutrientKey: 'magnesium',
      amount: 500,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
  ];
  const targets = [
    {
      decisionId: 'mg-rda-ul',
      effectiveFrom: '2026-01-01',
      status: 'active',
      nutrientKey: 'magnesium',
      targetAmount: 400,
      upperTarget: 800,
      unit: 'mg',
      basis: 'RDA / UL',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, targets, '2026-10-03', 7);
  const magnesium = data.nutrients.find((nutrient) => nutrient.key === 'magnesium');

  assert.ok(magnesium);
  assert.equal(magnesium.evaluatedDays, 3);
  assert.equal(magnesium.attentionDays, 2);
  assert.equal(magnesium.attentionKind, 'above-limit');
  assert.equal(data.attention[0]?.key, 'magnesium');
});

test('Nutrientes marca mixed si el mismo período cruza ambos extremos de una referencia', () => {
  const summary = [
    {
      date: '2026-10-01',
      nutrientKey: 'magnesium',
      amount: 300,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-02',
      nutrientKey: 'magnesium',
      amount: 900,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-03',
      nutrientKey: 'magnesium',
      amount: 950,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
  ];
  const targets = [
    {
      decisionId: 'mg-rda-ul',
      effectiveFrom: '2026-01-01',
      status: 'active',
      nutrientKey: 'magnesium',
      targetAmount: 400,
      upperTarget: 800,
      unit: 'mg',
      basis: 'RDA / UL',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, targets, '2026-10-03', 7);
  const magnesium = data.nutrients.find((nutrient) => nutrient.key === 'magnesium');

  assert.ok(magnesium);
  assert.equal(magnesium.attentionDays, 3);
  assert.equal(magnesium.attentionKind, 'mixed');
});

test('Nutrientes resuelve la decisión de target efectiva para cada fecha del período', () => {
  const summary = [
    {
      date: '2026-10-01',
      nutrientKey: 'magnesium',
      amount: 420,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-02',
      nutrientKey: 'magnesium',
      amount: 420,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
    {
      date: '2026-10-03',
      nutrientKey: 'magnesium',
      amount: 420,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
  ];
  const targets = [
    {
      decisionId: 'mg-old',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-10-01',
      status: 'superseded',
      nutrientKey: 'magnesium',
      targetAmount: 400,
      unit: 'mg',
      basis: 'RDA',
    },
    {
      decisionId: 'mg-new',
      effectiveFrom: '2026-10-02',
      status: 'active',
      nutrientKey: 'magnesium',
      targetAmount: 450,
      unit: 'mg',
      basis: 'RDA',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, targets, '2026-10-03', 7);
  const magnesium = data.nutrients.find((nutrient) => nutrient.key === 'magnesium');

  assert.ok(magnesium);
  assert.equal(magnesium.evaluatedDays, 3);
  assert.equal(magnesium.attentionDays, 2);
  assert.equal(magnesium.targetDecisionCount, 2);
  assert.equal(magnesium.currentReference?.decisionId, 'mg-new');
  assert.equal(data.attention[0]?.key, 'magnesium');
});

test('Nutrientes no revive una referencia superseded como referencia actual', () => {
  const summary = [
    {
      date: '2026-10-06',
      nutrientKey: 'magnesium',
      amount: 420,
      sourceCoverage: 'complete',
      confidence: 'high',
    },
  ];
  const targets = [
    {
      decisionId: 'mg-old-open',
      effectiveFrom: '2026-09-01',
      status: 'superseded',
      nutrientKey: 'magnesium',
      targetAmount: 400,
      unit: 'mg',
      basis: 'RDA',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, targets, '2026-10-06', 7);
  const magnesium = data.nutrients.find((nutrient) => nutrient.key === 'magnesium');

  assert.ok(magnesium);
  assert.equal(magnesium.currentReference, null);
  assert.equal(magnesium.evaluatedDays, 0);
});

test('Nutrientes falla cerrado si targetDecisionId no corresponde a la fecha', () => {
  const summary = [
    {
      date: '2026-10-01',
      nutrientKey: 'magnesium',
      amount: 420,
      targetDecisionId: 'future',
      sourceCoverage: 'complete',
      confidence: 'high',
    },
  ];
  const targets = [
    {
      decisionId: 'old',
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-10-01',
      status: 'superseded',
      nutrientKey: 'magnesium',
      targetAmount: 400,
      unit: 'mg',
      basis: 'RDA',
    },
    {
      decisionId: 'future',
      effectiveFrom: '2026-10-02',
      status: 'active',
      nutrientKey: 'magnesium',
      targetAmount: 450,
      unit: 'mg',
      basis: 'RDA',
    },
  ];

  const data = buildNutritionNutrientWindow(summary, targets, '2026-10-06', 7);
  const magnesium = data.nutrients.find((nutrient) => nutrient.key === 'magnesium');

  assert.ok(magnesium);
  assert.equal(magnesium.completeDays, 1);
  assert.equal(magnesium.evaluatedDays, 0);
  assert.equal(magnesium.attentionDays, 0);
});

test('Tendencias conserva por lineage el target histórico aunque la decisión esté superseded', () => {
  const summary = {
    date: '2026-09-15',
    energyTargetKcal: 2500,
    targetDecisionId: 'target-old',
  };
  const targets = [
    {
      decisionId: 'target-old',
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-09-30',
      status: 'superseded',
      energyTargetKcal: 2500,
    },
    {
      decisionId: 'target-current',
      effectiveFrom: '2026-10-01',
      status: 'active',
      energyTargetKcal: 2700,
    },
  ];

  assert.deepEqual(resolveNutritionHistoricalEnergyTarget(summary, targets, summary.date, '2026-10-06'), {
    decisionId: 'target-old',
    energyKcal: 2500,
    energyKcalLow: null,
    energyKcalHigh: null,
  });
});

test('Tendencias resuelve por fecha cuando Daily Summary todavía no trae targetDecisionId', () => {
  const summary = {
    date: '2026-09-15',
    energyTargetKcal: null,
  };
  const targets = [
    {
      decisionId: 'target-old',
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-09-30',
      status: 'superseded',
      energyTargetKcal: 2500,
    },
    {
      decisionId: 'target-current',
      effectiveFrom: '2026-10-01',
      status: 'active',
      energyTargetKcal: 2700,
    },
  ];

  assert.equal(
    resolveNutritionHistoricalEnergyTarget(summary, targets, summary.date, '2026-10-06').decisionId,
    'target-old',
  );
  assert.equal(
    resolveNutritionHistoricalEnergyTarget(summary, targets, summary.date, '2026-10-06').energyKcal,
    2500,
  );
});

test('Tendencias preserva el rango del target canónico y no lo colapsa al punto del resumen', () => {
  const summary = {
    date: '2026-10-03',
    energyTargetKcal: 2500,
    targetDecisionId: 'target-range',
  };
  const targets = [
    {
      decisionId: 'target-range',
      effectiveFrom: '2026-10-01',
      status: 'active',
      energyTargetKcal: null,
      energyTargetKcalLow: 2400,
      energyTargetKcalHigh: 2600,
    },
  ];

  assert.deepEqual(resolveNutritionHistoricalEnergyTarget(summary, targets, summary.date, '2026-10-06'), {
    decisionId: 'target-range',
    energyKcal: null,
    energyKcalLow: 2400,
    energyKcalHigh: 2600,
  });
});

test('Tendencias falla cerrada en lineage inválido y no sustituye otra decisión', () => {
  const summary = {
    date: '2026-10-03',
    energyTargetKcal: 2450,
    targetDecisionId: 'missing-decision',
  };
  const targets = [
    {
      decisionId: 'target-other',
      effectiveFrom: '2026-10-01',
      status: 'active',
      energyTargetKcal: 2700,
    },
    {
      decisionId: 'target-void',
      effectiveFrom: '2026-09-01',
      status: 'void',
      energyTargetKcal: 2300,
    },
  ];

  assert.deepEqual(resolveNutritionHistoricalEnergyTarget(summary, targets, summary.date, '2026-10-06'), {
    decisionId: 'missing-decision',
    energyKcal: 2450,
    energyKcalLow: null,
    energyKcalHigh: null,
  });
});

test('el delta contra target rango mide al borde más cercano sin inventar midpoint', () => {
  assert.equal(nutritionDisplayDeltaToTarget(2500, null, null, null, 2400, 2600), 0);
  assert.equal(nutritionDisplayDeltaToTarget(2300, null, null, null, 2400, 2600), -100);
  assert.equal(nutritionDisplayDeltaToTarget(2700, null, null, null, 2400, 2600), 100);
});

test('un target puntual conserva prioridad sobre sus límites auxiliares', () => {
  assert.equal(nutritionDisplayDeltaToTarget(2600, null, null, 2500, 2400, 2700), 100);
});

test('Hoy histórico puede usar una decisión superseded vigente para esa fecha', () => {
  const target = selectNutritionTargetRowForDate(
    [
      {
        decisionId: 'old',
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-09-30',
        status: 'superseded',
      },
      {
        decisionId: 'current',
        effectiveFrom: '2026-10-01',
        status: 'active',
      },
    ],
    '2026-09-15',
  );

  assert.equal(target?.decisionId, 'old');
});

test('si dos decisiones empiezan el mismo día, active prevalece sobre superseded', () => {
  const target = selectNutritionTargetRowForDate(
    [
      {
        decisionId: 'old-same-day',
        effectiveFrom: '2026-10-01',
        status: 'superseded',
      },
      {
        decisionId: 'active-same-day',
        effectiveFrom: '2026-10-01',
        status: 'active',
      },
    ],
    '2026-10-03',
  );

  assert.equal(target?.decisionId, 'active-same-day');
});

test('el target actual no revive una decisión superseded abierta', () => {
  const target = selectNutritionTargetRowForDate(
    [
      {
        decisionId: 'old-open',
        effectiveFrom: '2026-09-01',
        status: 'superseded',
      },
    ],
    '2026-10-06',
    { includeSuperseded: false },
  );

  assert.equal(target, null);
});

test('lineage con rango de vigencia incompatible falla cerrada al resumen', () => {
  const summary = {
    date: '2026-09-15',
    energyTargetKcal: 2450,
    targetDecisionId: 'future-target',
  };
  const targets = [
    {
      decisionId: 'future-target',
      effectiveFrom: '2026-10-01',
      status: 'active',
      energyTargetKcal: 2700,
    },
  ];

  assert.deepEqual(
    resolveNutritionHistoricalEnergyTarget(summary, targets, summary.date, '2026-10-06'),
    {
      decisionId: 'future-target',
      energyKcal: 2450,
      energyKcalLow: null,
      energyKcalHigh: null,
    },
  );
});

test('lineage actual no acepta una decisión superseded como target vigente', () => {
  const summary = {
    date: '2026-10-06',
    energyTargetKcal: 2500,
    targetDecisionId: 'old-open',
  };
  const targets = [
    {
      decisionId: 'old-open',
      effectiveFrom: '2026-09-01',
      status: 'superseded',
      energyTargetKcal: 2400,
    },
  ];

  assert.deepEqual(
    resolveNutritionHistoricalEnergyTarget(summary, targets, summary.date, '2026-10-06'),
    {
      decisionId: 'old-open',
      energyKcal: 2500,
      energyKcalLow: null,
      energyKcalHigh: null,
    },
  );
});
