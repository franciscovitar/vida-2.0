import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  alignByDate,
  averageRanks,
  classifyStrength,
  spearmanFromPairs,
  sampleConfidence,
  CAUSALITY_DISCLAIMER,
} from '@/lib/adapters/correlation';
import { compareTotals } from '@/lib/adapters/compare';
import { assertReportSafe, buildAnalysisReport } from '@/lib/adapters/analysis-report';
import { buildHabitsPageData } from '@/lib/adapters/habits-period';
import { buildProductivityPageData } from '@/lib/adapters/productivity-period';
import { parseRegistroDiario } from '@/lib/adapters/registro-diario';
import { parseSalud } from '@/lib/adapters/salud';
import { buildHealthPageData } from '@/lib/adapters/salud-period';
import { buildTrendsPageData } from '@/lib/adapters/trends';
import { RD, REGISTRO_DIARIO_HEADERS, SAL, SALUD_HEADERS } from '@/lib/google/constants';
import { buildMockDomainRecords } from '@/lib/mock-data/domain-history';
import { periodWindow } from '@/lib/periods';
import { ALLOWED_SPREADSHEET_ID, isAllowedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

const TODAY = '2026-07-20';

function buildBundle(periodDays: 7 | 30 | 90 = 7) {
  const mock = buildMockDomainRecords(TODAY);
  const window = periodWindow(TODAY, periodDays);
  const habits = buildHabitsPageData({
    records: mock.registro,
    today: TODAY,
    window,
    todayHabits: [],
    todayWeekly: [],
    rowExists: true,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const health = buildHealthPageData({
    records: mock.salud,
    today: TODAY,
    window,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const productivity = buildProductivityPageData({
    records: mock.registro,
    today: TODAY,
    window,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const trends = buildTrendsPageData({
    registro: mock.registro,
    salud: mock.salud,
    today: TODAY,
    window,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const analysis = buildAnalysisReport({ trends, habits, health, productivity });
  return { trends, analysis, habits, health, productivity };
}

test('T1. alineación por la misma fecha entre dominios', () => {
  const left = new Map([
    ['2026-07-18', 7],
    ['2026-07-19', 8],
  ]);
  const right = new Map([
    ['2026-07-19', 4],
    ['2026-07-20', 5],
  ]);
  const pairs = alignByDate(left, right);
  assert.deepEqual(
    pairs.map((p) => p.date),
    ['2026-07-19'],
  );
  assert.equal(pairs[0].x, 8);
  assert.equal(pairs[0].y, 4);
});

test('T2. días faltantes no se convierten en cero', () => {
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-19',
      [RD.work]: 30,
      [RD.energy]: 3,
    }),
  ]);
  const salud = parseSalud([
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, { [SAL.fecha]: '2026-07-19', [SAL.sleep]: 7 }),
  ]);
  const trends = buildTrendsPageData({
    registro,
    salud,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const sleep = trends.evolution.find((s) => s.id === 'sleep');
  assert.ok(sleep);
  const idx18 = sleep.dates.indexOf('2026-07-18');
  assert.ok(idx18 >= 0);
  assert.equal(sleep.values[idx18], null);
  assert.notEqual(sleep.values[idx18], 0);
});

test('T3. cero real se conserva', () => {
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-19',
      [RD.work]: 0,
      [RD.leisure]: 0,
    }),
  ]);
  const trends = buildTrendsPageData({
    registro,
    salud: [],
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const work = trends.summary.find((m) => m.id === 'work');
  assert.ok(work);
  assert.equal(work.currentValue, 0);
  assert.match(work.currentLabel, /0 min/);
});

test('T4. Spearman con datos conocidos', () => {
  // Monótono creciente perfecto → ρ = 1
  const pairs = [1, 2, 3, 4, 5].map((n, i) => ({
    date: `2026-07-${10 + i}`,
    x: n,
    y: n * 2,
  }));
  const result = spearmanFromPairs(pairs);
  assert.equal(result.rho, 1);
  assert.equal(result.direction, 'positive');
});

test('T5. empates en rankings', () => {
  const ranks = averageRanks([10, 20, 20, 40]);
  assert.deepEqual(ranks, [1, 2.5, 2.5, 4]);
});

test('T6. menos de 5 pares no calcula asociación', () => {
  const pairs = [
    { date: 'a', x: 1, y: 2 },
    { date: 'b', x: 2, y: 3 },
    { date: 'c', x: 3, y: 4 },
    { date: 'd', x: 4, y: 5 },
  ];
  const result = spearmanFromPairs(pairs);
  assert.equal(result.rho, null);
  assert.equal(result.confidence, 'insufficient');
});

test('T7. clasificación de asociaciones', () => {
  assert.equal(classifyStrength(0.1), 'minimal');
  assert.equal(classifyStrength(0.25), 'weak');
  assert.equal(classifyStrength(0.5), 'moderate');
  assert.equal(classifyStrength(0.75), 'strong');
  assert.equal(sampleConfidence(5), 'very_small');
  assert.equal(sampleConfidence(12), 'limited');
  assert.equal(sampleConfidence(25), 'useful');
});

test('T8. no se afirma causalidad en textos generados', () => {
  const { analysis, trends } = buildBundle(30);
  assert.match(analysis.plainText, /no demuestran causalidad|no demuestra que/i);
  assert.ok(
    trends.relations.every(
      (rel) =>
        rel.result.rho === null ||
        rel.summary.includes('no demuestra') ||
        rel.summary.includes('No hay suficientes'),
    ),
  );
  assert.ok(CAUSALITY_DISCLAIMER.includes('no demuestra'));
  assert.doesNotMatch(analysis.plainText, /por lo tanto (debes|hay que) /i);
});

test('T9. comparación contra período anterior', () => {
  const { trends } = buildBundle(7);
  assert.ok(trends.summary.every((m) => typeof m.compare.label === 'string'));
  assert.ok(trends.summary.some((m) => m.previousLabel.length > 0));
});

test('T10. división por cero no produce Infinity o NaN', () => {
  const cmp = compareTotals(10, 0);
  assert.equal(cmp.label, 'Sin comparación');
  assert.doesNotMatch(cmp.label, /Infinity|NaN/);
  const { analysis } = buildBundle(7);
  assert.doesNotMatch(analysis.plainText, /Infinity|NaN/);
});

test('T11. cobertura independiente por dominio', () => {
  const { trends } = buildBundle(7);
  assert.ok(Number.isFinite(trends.coverage.habitsDays));
  assert.ok(Number.isFinite(trends.coverage.healthDays));
  assert.ok(Number.isFinite(trends.coverage.productivityDays));
});

test('T12. el informe conserva unidades y fechas', () => {
  const { analysis } = buildBundle(7);
  assert.match(analysis.plainText, /2026-07-/);
  assert.match(analysis.plainText, /min|h|%|ppm|veces/i);
});

test('T13. el informe diferencia cero de Sin datos', () => {
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, { [RD.fecha]: '2026-07-19', [RD.work]: 0 }),
  ]);
  const window = periodWindow(TODAY, 7);
  const trends = buildTrendsPageData({
    registro,
    salud: [],
    today: TODAY,
    window,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const habits = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window,
    todayHabits: [],
    todayWeekly: [],
    rowExists: false,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const health = buildHealthPageData({
    records: [],
    today: TODAY,
    window,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const productivity = buildProductivityPageData({
    records: registro,
    today: TODAY,
    window,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const analysis = buildAnalysisReport({ trends, habits, health, productivity });
  assert.match(analysis.plainText, /0 min/);
  assert.match(analysis.plainText, /Sin datos/);
});

test('T14. el informe no contiene credenciales ni IDs internos', () => {
  const { analysis } = buildBundle(30);
  assert.equal(assertReportSafe(analysis.plainText), true);
  assert.doesNotMatch(analysis.plainText, /PRIVATE KEY|client_email|spreadsheetId/i);
});

test('T15. copiar genera texto válido para 7, 30 y 90 días', () => {
  for (const days of [7, 30, 90] as const) {
    const { analysis } = buildBundle(days);
    assert.match(analysis.plainText, new RegExp(`INFORME DE ${days} DÍAS`));
    assert.match(analysis.plainText, /HÁBITOS/);
    assert.match(analysis.plainText, /SALUD/);
    assert.match(analysis.plainText, /PRODUCTIVIDAD/);
    assert.match(analysis.plainText, /PREGUNTAS PARA ANALIZAR/);
    assert.equal(assertReportSafe(analysis.plainText), true);
  }
});

test('T16. producción continúa rechazada', () => {
  assert.equal(isAllowedSpreadsheetId(ALLOWED_SPREADSHEET_ID), true);
  assert.equal(isAllowedSpreadsheetId('1ProductionXXXXXXXX'), false);
});

test('T17. escritura permanece limitada a los diez hábitos', () => {
  const auth = readFileSync(join(process.cwd(), 'lib', 'habits', 'authorized.ts'), 'utf8');
  const toggle = readFileSync(join(process.cwd(), 'lib', 'habits', 'toggle.ts'), 'utf8');
  assert.match(auth, /AUTHORIZED_HABIT_NAMES/);
  assert.match(toggle, /isAuthorizedHabitName/);
  assert.match(toggle, /isAllowedSpreadsheetId/);
});

test('T18. mock funciona sin credenciales', () => {
  const { trends, analysis } = buildBundle(7);
  assert.equal(trends.source, 'mock');
  assert.equal(analysis.source, 'mock');
  assert.ok(analysis.plainText.length > 100);
});

test('T19. /tendencias sin overflow-x scroll de layout', () => {
  const css = readFileSync(join(process.cwd(), 'app', 'tendencias', 'page.module.scss'), 'utf8');
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.doesNotMatch(css, /overflow-x:\s*scroll/);
});

test('T20. /analisis-ia sin overflow-x scroll de layout', () => {
  const css = readFileSync(join(process.cwd(), 'app', 'analisis-ia', 'page.module.scss'), 'utf8');
  assert.match(css, /min-width:\s*0/);
  assert.doesNotMatch(css, /overflow-x:\s*scroll/);
});

test('T. no hay nuevas escrituras estructurales', () => {
  const files = [
    'lib/adapters/trends.ts',
    'lib/adapters/analysis-report.ts',
    'lib/adapters/correlation.ts',
  ];
  for (const rel of files) {
    const content = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.doesNotMatch(
      content,
      /values:append|batchClear|insertDimension|deleteDimension|values\.update/,
    );
  }
  const lib = join(process.cwd(), 'lib');
  for (const entry of readdirSync(lib, { recursive: true }) as string[]) {
    if (!entry.endsWith('.ts')) continue;
    const content = readFileSync(join(lib, entry), 'utf8');
    assert.doesNotMatch(content, /values:append|batchClear|insertDimension|deleteDimension/);
  }
});
