import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildHealthPageData } from '@/lib/adapters/salud-period';
import { parseImportStatus, parseSalud } from '@/lib/adapters/salud';
import { SAL, SAL_EXTENDED, SALUD_HEADERS } from '@/lib/google/constants';
import { periodWindow } from '@/lib/periods';

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

const EXTENDED_HEADERS = [...SALUD_HEADERS, ...Object.values(SAL_EXTENDED)];

test('Health V2 parsea columnas extendidas sin volverlas obligatorias', () => {
  const legacy = parseSalud([
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, { [SAL.fecha]: '2026-09-01', [SAL.steps]: 5000 }),
  ])[0];
  assert.equal(legacy.coreSleepHours.kind, 'empty');
  assert.equal(legacy.walkingSpeed.kind, 'empty');

  const extended = parseSalud([
    [...EXTENDED_HEADERS],
    rowFor(EXTENDED_HEADERS, {
      [SAL.fecha]: '2026-09-01',
      [SAL.steps]: 6000,
      [SAL.importStatus]: 'incompleto_fuente',
      [SAL_EXTENDED.coreSleep]: 4.2,
      [SAL_EXTENDED.walkingSpeed]: 4.8,
      [SAL_EXTENDED.stepLengthCm]: 72.4,
      [SAL_EXTENDED.missingCore]: 'Sueño, FC reposo',
    }),
  ])[0];
  assert.equal(extended.coreSleepHours.kind, 'value');
  assert.equal(extended.walkingSpeed.kind, 'value');
  assert.equal(extended.stepLengthCm.kind, 'value');
  assert.equal(parseImportStatus(extended.importStatus), 'partial');
});

test('Health V2 agrupa métricas y compara período, baseline y calidad', () => {
  const rows = [
    [...EXTENDED_HEADERS],
    rowFor(EXTENDED_HEADERS, {
      [SAL.fecha]: '2026-08-20',
      [SAL.steps]: 4000,
      [SAL.sleep]: 7,
      [SAL.restingHr]: 60,
      [SAL.importStatus]: 'completo',
      [SAL_EXTENDED.walkingSpeed]: 4,
    }),
    rowFor(EXTENDED_HEADERS, {
      [SAL.fecha]: '2026-08-24',
      [SAL.steps]: 4500,
      [SAL.sleep]: 7.2,
      [SAL.restingHr]: 59,
      [SAL.importStatus]: 'completo',
      [SAL_EXTENDED.walkingSpeed]: 4.1,
    }),
    rowFor(EXTENDED_HEADERS, {
      [SAL.fecha]: '2026-08-31',
      [SAL.steps]: 6500,
      [SAL.sleep]: 8,
      [SAL.restingHr]: 56,
      [SAL.importStatus]: 'parcial',
      [SAL_EXTENDED.walkingSpeed]: 4.7,
      [SAL_EXTENDED.missingCore]: 'FC máxima',
    }),
    rowFor(EXTENDED_HEADERS, {
      [SAL.fecha]: '2026-09-01',
      [SAL.steps]: 7000,
      [SAL.sleep]: 8.2,
      [SAL.restingHr]: 55,
      [SAL.importStatus]: 'completo',
      [SAL_EXTENDED.walkingSpeed]: 4.8,
    }),
  ];

  const page = buildHealthPageData({
    records: parseSalud(rows),
    today: '2026-09-01',
    window: periodWindow('2026-09-01', 7),
    source: 'google',
    status: 'ready',
    notice: null,
  });

  const steps = page.metrics.find((metric) => metric.id === 'steps');
  const speed = page.metrics.find((metric) => metric.id === 'walkingSpeed');
  assert.equal(steps?.group, 'movement');
  assert.equal(speed?.group, 'movement');
  assert.equal(steps?.coverageDays, 2);
  assert.equal(steps?.compare.available, true);
  assert.equal(steps?.baselineCompare.available, true);
  assert.equal(page.partialDays, 1);
  assert.equal(page.completeDays, 1);
  assert.ok(page.baselineDays >= 1);
  assert.ok(page.insights.some((insight) => insight.id === 'partial-data'));
});

test('Health V2 conserva una UI visual sin convertirla en diagnóstico', () => {
  const page = readFileSync(join(process.cwd(), 'app', '(app)', 'salud', 'page.tsx'), 'utf8');
  assert.match(page, /<HealthTodayHero/);
  assert.match(page, /base 30d/);
  assert.match(page, /no como diagnóstico/i);
  assert.match(page, /SparkBars/);
});
