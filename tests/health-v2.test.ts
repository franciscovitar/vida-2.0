import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildHealthPageData } from '@/lib/adapters/salud-period';
import { parseImportStatus, parseSalud } from '@/lib/adapters/salud';
import { SAL, SALUD_HEADERS } from '@/lib/google/constants';
import { periodWindow } from '@/lib/periods';

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

const TODAY = '2026-07-20';

test('Salud V2 parsea métricas extendidas sin convertir faltantes en cero', () => {
  const [record] = parseSalud([
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: TODAY,
      [SAL.coreSleep]: 4.1,
      [SAL.deepSleep]: 1.8,
      [SAL.remSleep]: 1.7,
      [SAL.awakeSleep]: 0.2,
      [SAL.walkRunKm]: 5.4,
      [SAL.minHr]: 41,
      [SAL.maxHr]: 132,
      [SAL.stepLengthCm]: 68.5,
      [SAL.floors]: 4,
      [SAL.walkingAsymmetry]: 1.2,
      [SAL.spo2]: 97.8,
      [SAL.walkingSpeed]: 4.3,
      [SAL.activeCaloriesKcal]: 420,
    }),
  ]);

  assert.equal(record.coreSleepHours.kind, 'value');
  assert.equal(record.coreSleepHours.kind === 'value' ? record.coreSleepHours.value : null, 4.1);
  assert.equal(record.walkingSpeed.kind, 'value');
  assert.equal(record.activeCaloriesKcal.kind, 'value');
  assert.equal(record.hrv.kind, 'empty');
});

test('Salud V2 usa un baseline personal no solapado de 30 días y prioriza kcal explícitas', () => {
  const records = parseSalud([
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: '2026-06-25',
      [SAL.sleep]: 6,
      [SAL.steps]: 5000,
      [SAL.restingHr]: 62,
      [SAL.activeCaloriesKcal]: 200,
    }),
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: '2026-07-12',
      [SAL.sleep]: 7,
      [SAL.steps]: 6000,
      [SAL.restingHr]: 60,
      [SAL.hrv]: 45,
      [SAL.activeCaloriesKcal]: 250,
    }),
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: '2026-07-18',
      [SAL.sleep]: 8,
      [SAL.steps]: 4000,
      [SAL.restingHr]: 56,
      [SAL.hrv]: 50,
      [SAL.activeCalories]: 100,
      [SAL.activeCaloriesKcal]: 350,
    }),
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: '2026-07-19',
      [SAL.sleep]: 8,
      [SAL.steps]: 4000,
      [SAL.restingHr]: 56,
      [SAL.hrv]: 50,
      [SAL.activeCalories]: 100,
      [SAL.activeCaloriesKcal]: 350,
    }),
  ]);

  const page = buildHealthPageData({
    records,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'ready',
    notice: null,
  });

  const sleep = page.metrics.find((metric) => metric.id === 'sleep');
  const calories = page.metrics.find((metric) => metric.id === 'calories');

  assert.equal(page.availableDays, 2);
  assert.equal(page.previousAvailableDays, 1);
  assert.equal(page.baselineAvailableDays, 2);
  assert.equal(sleep?.average, 8);
  assert.equal(sleep?.baselineAverage, 6.5);
  assert.equal(calories?.average, 350);
});

test('Salud V2 distingue señal semántica de métrica neutral', () => {
  const records = parseSalud([
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: '2026-07-12',
      [SAL.sleep]: 7,
      [SAL.steps]: 6000,
      [SAL.restingHr]: 60,
      [SAL.hrv]: 45,
    }),
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: '2026-07-18',
      [SAL.sleep]: 8,
      [SAL.steps]: 4000,
      [SAL.restingHr]: 56,
      [SAL.hrv]: 55,
    }),
  ]);

  const page = buildHealthPageData({
    records,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'ready',
    notice: null,
  });
  const summary = Object.fromEntries(page.summary.map((item) => [item.id, item.tone]));

  assert.equal(summary.sleep, 'good');
  assert.equal(summary.restingHr, 'good');
  assert.equal(summary.steps, 'warning');
  assert.equal(summary.hrv, 'neutral');
});

test('estado incompleto de importación se muestra como parcial', () => {
  assert.equal(parseImportStatus({ kind: 'value', value: 'incompleto_fuente' }), 'partial');
});
