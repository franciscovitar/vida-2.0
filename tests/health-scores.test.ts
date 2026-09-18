import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildHealthPageData } from '@/lib/adapters/salud-period';
import { parseSalud } from '@/lib/adapters/salud';
import { addDaysYmd } from '@/lib/adapters/dates';
import { buildExplainableHealthScores } from '@/lib/health/scores';
import { SAL, SAL_EXTENDED, SALUD_HEADERS } from '@/lib/google/constants';
import { periodWindow } from '@/lib/periods';

const TODAY = '2026-09-18';
const HEADERS = [...SALUD_HEADERS, ...Object.values(SAL_EXTENDED)];

function row(values: Record<string, unknown>): unknown[] {
  return HEADERS.map((header) => (header in values ? values[header] : ''));
}

function baselineRows(
  options: {
    hrv?: boolean;
    activeCalories?: number;
    mobility?: boolean;
    sleepOutlierAtStart?: boolean;
  } = {},
): unknown[][] {
  const rows: unknown[][] = [];
  for (let offset = -14; offset <= -1; offset += 1) {
    const first = offset === -14;
    rows.push(
      row({
        [SAL.fecha]: addDaysYmd(TODAY, offset),
        [SAL.sleep]: options.sleepOutlierAtStart && first ? 30 : 7.5,
        [SAL.restingHr]: 55,
        [SAL.hrv]: options.hrv === false ? '' : 60,
        [SAL.steps]: 7000,
        [SAL.activeCalories]: options.activeCalories ?? 350,
        [SAL.importStatus]: 'completo',
        [SAL_EXTENDED.sleepInBed]: 8,
        ...(options.mobility === false
          ? {}
          : {
              [SAL_EXTENDED.walkingSpeed]: 4.8,
              [SAL_EXTENDED.stepLengthCm]: 75,
              [SAL_EXTENDED.walkingAsymmetry]: 1.5,
            }),
      }),
    );
  }
  return rows;
}

function todayRow(
  options: {
    hrv?: boolean;
    steps?: number;
    activeCalories?: number;
    sleep?: number;
    restingHr?: number;
    mobility?: boolean;
  } = {},
): unknown[] {
  return row({
    [SAL.fecha]: TODAY,
    [SAL.sleep]: options.sleep ?? 7.5,
    [SAL.restingHr]: options.restingHr ?? 55,
    [SAL.hrv]: options.hrv === false ? '' : 60,
    [SAL.steps]: options.steps ?? 7000,
    [SAL.activeCalories]: options.activeCalories ?? 350,
    [SAL.importStatus]: 'completo',
    [SAL_EXTENDED.sleepInBed]: 8,
    ...(options.mobility === false
      ? {}
      : {
          [SAL_EXTENDED.walkingSpeed]: 4.8,
          [SAL_EXTENDED.stepLengthCm]: 75,
          [SAL_EXTENDED.walkingAsymmetry]: 1.5,
        }),
  });
}

function healthFor(rows: readonly unknown[][], period: 7 | 30 = 7) {
  return buildHealthPageData({
    records: parseSalud([[...HEADERS], ...rows]),
    today: TODAY,
    window: periodWindow(TODAY, period),
    source: 'google',
    status: 'ready',
    notice: null,
  });
}

function scoreOf(rows: readonly unknown[][], id: string) {
  const scores = buildExplainableHealthScores(healthFor(rows));
  if (id === 'readiness') return scores.readiness;
  const found = scores.domains.find((score) => score.id === id);
  assert.ok(found, `falta score ${id}`);
  return found;
}

test('HS1. datos estables producen scores explicables y versionados', () => {
  const scores = buildExplainableHealthScores(healthFor([...baselineRows(), todayRow()]));

  assert.ok((scores.readiness.score ?? 0) >= 80);
  assert.ok(scores.readiness.confidence > 0);
  const sleep = scores.domains.find((score) => score.id === 'sleep');
  assert.ok(sleep);
  assert.ok(
    sleep.confidence < 80,
    'sin regularidad/timing exactos, la confianza del Sleep Score no debe parecer alta',
  );
  assert.equal(scores.readiness.calculationVersion, 'health-scores-v1.1.0');
  assert.equal(scores.domains.length, 5);

  for (const domain of scores.domains) {
    assert.ok(domain.contributors.length > 0);
    assert.ok(domain.confidence >= 0 && domain.confidence <= 100);
    assert.ok(domain.score === null || (domain.score >= 0 && domain.score <= 100));
  }

  assert.equal(scores.momentum.direction, 'stable');
  assert.ok(scores.momentum.score !== null);
});

test('HS2. missing HRV baja confianza pero no se convierte en cero', () => {
  const full = scoreOf([...baselineRows(), todayRow()], 'cardio-stability');
  const withoutHrv = scoreOf(
    [...baselineRows({ hrv: false }), todayRow({ hrv: false })],
    'cardio-stability',
  );

  assert.ok(full.score !== null);
  assert.ok(withoutHrv.score !== null);
  assert.ok(withoutHrv.confidence < full.confidence);
  assert.ok(withoutHrv.confidence < 80);
  const hrv = withoutHrv.contributors.find((item) => item.id === 'hrv');
  assert.equal(hrv?.score, null);
  assert.match(hrv?.detail ?? '', /no tiene cobertura/i);
});

test('HS3. el selector visual de período no cambia los scores diarios', () => {
  const rows = [...baselineRows(), todayRow()];
  const seven = buildExplainableHealthScores(healthFor(rows, 7));
  const thirty = buildExplainableHealthScores(healthFor(rows, 30));

  assert.deepEqual(seven, thirty);
});

test('HS4. calorías activas extremas no inflan Activity Score', () => {
  const lowCalories = scoreOf(
    [...baselineRows({ activeCalories: 50 }), todayRow({ activeCalories: 50 })],
    'activity',
  );
  const hugeCalories = scoreOf(
    [...baselineRows({ activeCalories: 5000 }), todayRow({ activeCalories: 5000 })],
    'activity',
  );

  assert.equal(lowCalories.score, hugeCalories.score);
  assert.equal(lowCalories.confidence, hugeCalories.confidence);
  assert.ok(lowCalories.uncertainties.some((text) => /calorías activas/i.test(text)));
});

test('HS5. un outlier aislado no destruye la base robusta ni el Sleep Score', () => {
  const health = healthFor([...baselineRows({ sleepOutlierAtStart: true }), todayRow()]);
  const sleep = buildExplainableHealthScores(health).domains.find((score) => score.id === 'sleep');

  assert.equal(health.signals.baseline.sleep.median, 7.5);
  assert.ok((health.signals.baseline.sleep.average ?? 0) > 9);
  assert.ok((sleep?.score ?? 0) >= 80);
});

test('HS6. sin sueño/FC no se fabrica Readiness numérico', () => {
  const health = healthFor([
    row({
      [SAL.fecha]: TODAY,
      [SAL.steps]: 6000,
      [SAL.importStatus]: 'parcial',
      [SAL_EXTENDED.missingCore]: 'Sueño, FC reposo',
    }),
  ]);
  const scores = buildExplainableHealthScores(health);

  assert.equal(scores.readiness.score, null);
  assert.equal(scores.readiness.band, 'insufficient');
  assert.ok(scores.readiness.confidence >= 0);
});

test('HS7. movilidad usa señal longitudinal propia y falla cerrado si no existe', () => {
  const withMobility = scoreOf([...baselineRows(), todayRow()], 'mobility');
  const withoutMobility = scoreOf(
    [...baselineRows({ mobility: false }), todayRow({ mobility: false })],
    'mobility',
  );

  assert.ok(withMobility.score !== null);
  assert.equal(withoutMobility.score, null);
  assert.equal(withoutMobility.band, 'insufficient');
});

test('HS8. la UI pone los scores antes del brief y conserva evidencia cruda debajo', () => {
  const page = readFileSync(join(process.cwd(), 'app', '(app)', 'salud', 'page.tsx'), 'utf8');
  const section = readFileSync(
    join(process.cwd(), 'components', 'health', 'HealthIntelligenceSections.tsx'),
    'utf8',
  );

  const scoresIndex = page.indexOf('<HealthScoreboardSection');
  const briefIndex = page.indexOf('<HealthTodayHero');
  const rawIndex = page.indexOf('health-history-title');

  assert.ok(scoresIndex > 0);
  assert.ok(scoresIndex < briefIndex);
  assert.ok(briefIndex < rawIndex);
  assert.match(section, /Health Intelligence V1\.1/);
  assert.match(section, /Confianza/);
  assert.match(section, /Score de bienestar\/readiness, no diagnóstico/);
  assert.match(section, /Ver cálculo/);
});
