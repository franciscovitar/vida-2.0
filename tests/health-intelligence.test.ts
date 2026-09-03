import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { addDaysYmd } from '@/lib/adapters/dates';
import { parseSalud } from '@/lib/adapters/salud';
import { buildHealthPageData } from '@/lib/adapters/salud-period';
import { SAL, SAL_EXTENDED, SALUD_HEADERS } from '@/lib/google/constants';
import {
  buildHealthIntelligence,
  HEALTH_GYM_UNAVAILABLE,
  HEALTH_MAX_PRIORITIES,
  HEALTH_NUTRITION_UNAVAILABLE,
  HEALTH_PERIOD_TREND_MIN_DAYS,
  type HealthGymInput,
  type HealthIntelligence,
  type HealthMonitoredSignal,
  type HealthNutritionInput,
} from '@/lib/health/intelligence';
import { periodWindow } from '@/lib/periods';

const TODAY = '2026-09-15';
const HEADERS = [...SALUD_HEADERS, ...Object.values(SAL_EXTENDED)];

/** Palabras que afirmarían una causa. Ninguna salida determinística puede usarlas. */
const CAUSAL_WORDING =
  /\bcausa\b|\bcausó\b|\bcausan\b|\bcausar\b|\bporque\b|\bdebido a\b|\bprovoc\w*|\bgeneró\b|\bhizo que\b|\bpor culpa\b/i;

function shift(days: number): string {
  return addDaysYmd(TODAY, days);
}

function row(values: Record<string, unknown>): unknown[] {
  return HEADERS.map((header) => (header in values ? values[header] : ''));
}

/** 14 días completos y estables que terminan ayer: base personal sintética. */
function baselineRows(overrides: Record<string, unknown> = {}): unknown[][] {
  const rows: unknown[][] = [];
  for (let offset = -14; offset <= -1; offset += 1) {
    rows.push(
      row({
        [SAL.fecha]: shift(offset),
        [SAL.sleep]: 7.5,
        [SAL.restingHr]: 55,
        [SAL.steps]: 8000,
        [SAL.activeCalories]: 400,
        [SAL.importStatus]: 'completo',
        ...overrides,
      }),
    );
  }
  return rows;
}

function intelligenceFor(
  rows: readonly unknown[][],
  options: { gym?: HealthGymInput; nutrition?: HealthNutritionInput } = {},
): HealthIntelligence {
  const health = buildHealthPageData({
    records: parseSalud([[...HEADERS], ...rows]),
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'google',
    status: 'ready',
    notice: null,
  });
  return buildHealthIntelligence({
    health,
    gym: options.gym ?? HEALTH_GYM_UNAVAILABLE,
    nutrition: options.nutrition ?? HEALTH_NUTRITION_UNAVAILABLE,
  });
}

function evidenceOf(intelligence: HealthIntelligence, signal: HealthMonitoredSignal) {
  const found = intelligence.currentState.evidence.find((item) => item.signal === signal);
  assert.ok(found, `falta evidencia de ${signal}`);
  return found;
}

/** Todas las cadenas generadas por la capa determinística. */
function allTexts(intelligence: HealthIntelligence): string[] {
  return [
    intelligence.currentState.headline,
    intelligence.currentState.explanation,
    ...intelligence.currentState.reasons,
    ...intelligence.currentState.evidence.map((item) => item.text),
    intelligence.currentState.lastInterpretable?.summary ?? '',
    intelligence.trajectory.headline,
    intelligence.trajectory.detail,
    ...intelligence.trajectory.items.map((item) => item.summary),
    ...intelligence.changes.map((item) => `${item.title} ${item.detail}`),
    intelligence.crossDomain.caveat,
    intelligence.crossDomain.gym.detail,
    intelligence.crossDomain.nutrition.detail,
    ...intelligence.priorities.map((item) => `${item.title} ${item.detail} ${item.evidence}`),
    intelligence.evidenceQuality.detail,
  ];
}

test('día completo y estable no exagera el estado actual', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 7.4,
      [SAL.restingHr]: 55,
      [SAL.steps]: 8100,
      [SAL.importStatus]: 'completo',
    }),
  ]);

  assert.equal(result.currentState.kind, 'normal-for-you');
  assert.equal(result.currentState.headline, 'Dentro de tu rango habitual');
  assert.equal(result.currentState.coreMissing.length, 0);
  assert.equal(result.evidenceQuality.level, 'strong');
  assert.equal(evidenceOf(result, 'sleep').concern, false);
  assert.equal(evidenceOf(result, 'restingHr').concern, false);
});

test('movimiento sin sueño ni FC deja el día como datos insuficientes', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({ [SAL.fecha]: TODAY, [SAL.steps]: 5400, [SAL.activeCalories]: 180 }),
  ]);

  assert.equal(result.currentState.kind, 'insufficient-data');
  assert.deepEqual([...result.currentState.coreMissing], ['Sueño total', 'FC en reposo']);
  assert.match(result.currentState.explanation, /movimiento por sí solo no permite concluir/i);
  assert.doesNotMatch(result.currentState.explanation, /recuperación (buena|correcta|óptima)/i);
});

test('una sola señal desviada no produce un estado multi-señal', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 5.8,
      [SAL.restingHr]: 55,
      [SAL.steps]: 8000,
      [SAL.importStatus]: 'completo',
    }),
  ]);

  assert.equal(result.currentState.kind, 'watch');
  assert.equal(result.currentState.evidence.filter((item) => item.concern).length, 1);
  assert.match(result.currentState.explanation, /una sola señal desviada/i);
});

test('varias señales alineadas producen below-usual con razones explícitas', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 5.8,
      [SAL.restingHr]: 62,
      [SAL.steps]: 8000,
      [SAL.importStatus]: 'completo',
    }),
  ]);

  assert.equal(result.currentState.kind, 'below-usual');
  assert.ok(result.currentState.reasons.length >= 2);
  assert.match(result.currentState.explanation, /Sueño total/);
  assert.match(result.currentState.explanation, /FC en reposo/);
});

test('HRV ausente no rompe ni genera una falsa alerta de señal núcleo faltante', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 7.4,
      [SAL.restingHr]: 55,
      [SAL.importStatus]: 'completo',
    }),
  ]);

  assert.equal(result.currentState.kind, 'normal-for-you');
  assert.ok(!result.currentState.coreMissing.includes('HRV'));
  const hrv = evidenceOf(result, 'hrv');
  assert.equal(hrv.value, null);
  assert.equal(hrv.materiality, 'unknown');
  assert.equal(hrv.concern, false);
});

test('HRV participa como señal núcleo sólo con días comparables suficientes', () => {
  const result = intelligenceFor([
    ...baselineRows({ [SAL.hrv]: 60 }),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 5.8,
      [SAL.restingHr]: 55,
      [SAL.hrv]: 45,
      [SAL.importStatus]: 'completo',
    }),
  ]);

  const hrv = evidenceOf(result, 'hrv');
  assert.equal(hrv.baselineDays, 14);
  assert.equal(hrv.materiality, 'material');
  assert.equal(hrv.concern, true);
  assert.equal(result.currentState.kind, 'below-usual');
});

test('un día histórico completo nunca sustituye a hoy', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.steps]: 5400,
      [SAL.importStatus]: 'parcial',
      [SAL_EXTENDED.missingCore]: 'Sueño, FC reposo',
    }),
  ]);

  assert.equal(result.currentState.date, TODAY);
  assert.equal(result.currentState.kind, 'insufficient-data');
  assert.equal(result.currentState.lastInterpretable?.date, shift(-1));
  assert.match(
    result.currentState.lastInterpretable?.summary ?? '',
    /historial, no el estado de hoy/i,
  );
  assert.match(result.currentState.explanation, /importación de hoy como parcial/i);
});

test('los faltantes quedan en null y nunca en cero', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({ [SAL.fecha]: TODAY, [SAL.steps]: 5400 }),
  ]);

  assert.equal(evidenceOf(result, 'sleep').value, null);
  assert.equal(evidenceOf(result, 'restingHr').value, null);
  assert.equal(evidenceOf(result, 'hrv').value, null);
  assert.equal(evidenceOf(result, 'steps').value, 5400);
});

const STABLE_TODAY = row({
  [SAL.fecha]: TODAY,
  [SAL.sleep]: 7.4,
  [SAL.restingHr]: 55,
  [SAL.steps]: 8100,
  [SAL.importStatus]: 'completo',
});

const GYM_READY: HealthGymInput = {
  state: 'ready',
  sessions: [
    { date: shift(-1), completed: true },
    { date: shift(-3), completed: true },
    { date: shift(-5), completed: true },
    { date: shift(-8), completed: true },
    { date: shift(-4), completed: false },
  ],
};

function nutritionHistory(days: number, tracked: number): HealthNutritionInput['history'] {
  return Array.from({ length: days }, (_, index) => ({
    date: shift(-days + index),
    trackedMealCount: index < tracked ? 2 : 0,
    energyCoverage: index < tracked ? 'complete' : 'none',
  }));
}

test('el contexto de gimnasio se deriva sin modificar el dominio de gimnasio', () => {
  const result = intelligenceFor([...baselineRows(), STABLE_TODAY], { gym: GYM_READY });
  const gym = result.crossDomain.gym;

  assert.equal(gym.state, 'ready');
  assert.equal(gym.sessionsLast7, 3);
  assert.equal(gym.sessionsPrevious7, 1);
  assert.equal(gym.daysSinceLastSession, 1);
  assert.equal(gym.lastSessionDate, shift(-1));
  const contextChange = result.changes.find((item) => item.id === 'gym-density-context');
  assert.ok(contextChange);
  assert.equal(contextChange.kind, 'context');
  assert.match(contextChange.detail, /no una relación demostrada/i);
});

test('Salud sigue funcionando cuando gimnasio no está disponible', () => {
  const result = intelligenceFor([...baselineRows(), STABLE_TODAY]);

  assert.equal(result.crossDomain.gym.state, 'unavailable');
  assert.equal(result.currentState.kind, 'normal-for-you');
  assert.equal(
    result.changes.some((item) => item.id === 'gym-density-context'),
    false,
  );
});

test('nutrición con cobertura suficiente aporta contexto', () => {
  const nutrition: HealthNutritionInput = {
    state: 'ready',
    todayEnergyCoverage: 'complete',
    todayTrackedMeals: 3,
    history: nutritionHistory(14, 10),
  };
  const result = intelligenceFor([...baselineRows(), STABLE_TODAY], { nutrition });

  assert.equal(result.crossDomain.nutrition.state, 'ready');
  assert.equal(result.crossDomain.nutrition.trackedDays, 10);
  assert.equal(result.crossDomain.nutrition.windowDays, 14);
  assert.match(result.crossDomain.nutrition.headline, /10 de 14 días registrados/);
});

test('nutrición parcial se enuncia con cautela y sin afirmar la ingesta', () => {
  const nutrition: HealthNutritionInput = {
    state: 'partial',
    todayEnergyCoverage: 'partial',
    todayTrackedMeals: 1,
    history: nutritionHistory(14, 6),
  };
  const result = intelligenceFor([...baselineRows(), STABLE_TODAY], { nutrition });

  assert.equal(result.crossDomain.nutrition.state, 'partial');
  assert.match(result.crossDomain.nutrition.detail, /cobertura de nutrición es parcial/i);
  assert.match(result.crossDomain.nutrition.detail, /no hay evidencia suficiente/i);
  assert.doesNotMatch(result.crossDomain.nutrition.detail, /comiste (poco|de más|mal)/i);
});

test('Salud sigue funcionando cuando nutrición no está disponible', () => {
  const result = intelligenceFor([...baselineRows(), STABLE_TODAY]);

  assert.equal(result.crossDomain.nutrition.state, 'unavailable');
  assert.match(result.crossDomain.nutrition.detail, /Salud sigue funcionando/i);
  assert.equal(result.currentState.kind, 'normal-for-you');
});

test('ninguna salida determinística usa lenguaje causal', () => {
  const nutrition: HealthNutritionInput = {
    state: 'partial',
    todayEnergyCoverage: 'partial',
    todayTrackedMeals: 1,
    history: nutritionHistory(14, 6),
  };
  const scenarios = [
    intelligenceFor([...baselineRows(), STABLE_TODAY], { gym: GYM_READY, nutrition }),
    intelligenceFor([
      ...baselineRows(),
      row({
        [SAL.fecha]: TODAY,
        [SAL.sleep]: 5.8,
        [SAL.restingHr]: 62,
        [SAL.importStatus]: 'completo',
      }),
    ]),
    intelligenceFor([...baselineRows(), row({ [SAL.fecha]: TODAY, [SAL.steps]: 5400 })]),
  ];

  for (const scenario of scenarios) {
    for (const text of allTexts(scenario)) {
      assert.doesNotMatch(text, CAUSAL_WORDING, `lenguaje causal en: ${text}`);
    }
  }
});

test('las prioridades están acotadas y protegidas por evidencia', () => {
  const stable = intelligenceFor([...baselineRows(), STABLE_TODAY]);
  assert.ok(stable.priorities.length <= HEALTH_MAX_PRIORITIES);
  assert.equal(stable.priorities[0].category, 'maintenance');
  assert.match(stable.priorities[0].title, /Mantené el patrón actual/);

  const degraded = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 5.8,
      [SAL.restingHr]: 62,
      [SAL.importStatus]: 'completo',
    }),
  ]);
  assert.ok(degraded.priorities.length <= HEALTH_MAX_PRIORITIES);
  assert.ok(degraded.priorities.some((item) => item.category === 'sleep'));
  assert.ok(degraded.priorities.every((item) => item.evidence.trim().length > 0));
});

test('sin evidencia suficiente se prioriza la calidad de datos, no una conclusión fisiológica', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({ [SAL.fecha]: TODAY, [SAL.steps]: 5400, [SAL.activeCalories]: 180 }),
  ]);

  assert.equal(result.evidenceQuality.level, 'limited');
  assert.equal(result.priorities[0].category, 'data-quality');
  assert.ok(!result.priorities.some((item) => item.category === 'cardio-recovery'));
});

test('la recomendación cardiovascular exige más de una señal desviada', () => {
  const single = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 7.4,
      [SAL.restingHr]: 62,
      [SAL.importStatus]: 'completo',
    }),
  ]);
  assert.equal(single.currentState.kind, 'watch');
  assert.ok(!single.priorities.some((item) => item.category === 'cardio-recovery'));

  const aligned = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 5.8,
      [SAL.restingHr]: 62,
      [SAL.importStatus]: 'completo',
    }),
  ]);
  assert.ok(aligned.priorities.some((item) => item.category === 'cardio-recovery'));
});

test('los umbrales de monitoreo respetan sus bordes exactos', () => {
  const restingHrFor = (value: number) =>
    evidenceOf(
      intelligenceFor([
        ...baselineRows(),
        row({
          [SAL.fecha]: TODAY,
          [SAL.sleep]: 7.5,
          [SAL.restingHr]: value,
          [SAL.importStatus]: 'completo',
        }),
      ]),
      'restingHr',
    );

  // Base 55 ppm. minAbsolute = 3 ppm gana sobre el umbral relativo leve.
  assert.equal(restingHrFor(57).materiality, 'none');
  assert.equal(restingHrFor(58).materiality, 'mild');
  assert.equal(restingHrFor(58).concern, false);
  assert.equal(restingHrFor(59).materiality, 'material');
  assert.equal(restingHrFor(59).concern, true);

  const sleepFor = (value: number) =>
    evidenceOf(
      intelligenceFor([
        ...baselineRows(),
        row({
          [SAL.fecha]: TODAY,
          [SAL.sleep]: value,
          [SAL.restingHr]: 55,
          [SAL.importStatus]: 'completo',
        }),
      ]),
      'sleep',
    );

  // Base 7,5 h: 6,6 h es exactamente el 12 % de desvío material.
  assert.equal(sleepFor(6.7).materiality, 'mild');
  assert.equal(sleepFor(6.7).concern, false);
  assert.equal(sleepFor(6.6).materiality, 'material');
  assert.equal(sleepFor(6.6).concern, true);
  // Dormir de más nunca es una preocupación.
  assert.equal(sleepFor(9).concern, false);
});

test('una base personal insuficiente impide afirmar que el día es normal', () => {
  const result = intelligenceFor([
    row({
      [SAL.fecha]: shift(-2),
      [SAL.sleep]: 7.5,
      [SAL.restingHr]: 55,
      [SAL.importStatus]: 'completo',
    }),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 7.4,
      [SAL.restingHr]: 55,
      [SAL.importStatus]: 'completo',
    }),
  ]);

  assert.equal(result.currentState.kind, 'insufficient-data');
  assert.equal(result.evidenceQuality.level, 'limited');
  assert.match(result.currentState.explanation, /base personal suficiente/i);
});

test('SpO₂ sólo aporta contexto y nunca se interpreta clínicamente', () => {
  const result = intelligenceFor([
    ...baselineRows({ [SAL.spo2]: 97 }),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 7.4,
      [SAL.restingHr]: 55,
      [SAL.spo2]: 94,
      [SAL.importStatus]: 'completo',
    }),
  ]);

  const spo2 = evidenceOf(result, 'spo2');
  assert.equal(spo2.role, 'context');
  assert.equal(spo2.materiality, 'material');
  assert.match(spo2.text, /no lo interpreta clínicamente/i);
  // Una señal de contexto no puede mover el estado del día.
  assert.equal(result.currentState.kind, 'normal-for-you');
});

/**
 * Historial con base personal y período anterior completos, y un período actual
 * donde sólo `sleepDays` días llegaron como importación completa. El resto son
 * importaciones parciales con movimiento y sin señales núcleo, igual que la
 * lectura real. Los días completos son los más antiguos, así que con cobertura
 * escasa hoy no aporta ninguna observación núcleo y la única evidencia posible
 * es la del período.
 */
function sparsePeriodRows(options: {
  sleepDays: number;
  sleepValue: number;
  currentSteps?: number;
}): unknown[][] {
  const rows: unknown[][] = [];
  // Base personal y período anterior: días -14 a -7 completos y estables.
  for (let offset = -14; offset <= -7; offset += 1) {
    rows.push(
      row({
        [SAL.fecha]: shift(offset),
        [SAL.sleep]: 7.5,
        [SAL.restingHr]: 55,
        [SAL.steps]: 8000,
        [SAL.activeCalories]: 400,
        [SAL.importStatus]: 'completo',
      }),
    );
  }
  // Período actual: días -6 a hoy. Sólo los primeros `sleepDays` son completos.
  let remaining = options.sleepDays;
  for (let offset = -6; offset <= 0; offset += 1) {
    const complete = remaining > 0;
    if (complete) remaining -= 1;
    rows.push(
      row({
        [SAL.fecha]: shift(offset),
        ...(complete ? { [SAL.sleep]: options.sleepValue, [SAL.restingHr]: 55 } : {}),
        [SAL.steps]: options.currentSteps ?? 8000,
        [SAL.importStatus]: complete ? 'completo' : 'parcial',
        ...(complete ? {} : { [SAL_EXTENDED.missingCore]: 'Sueño, FC reposo' }),
      }),
    );
  }
  return rows;
}

function trajectoryOf(intelligence: HealthIntelligence, id: string) {
  const found = intelligence.trajectory.items.find((item) => item.id === id);
  assert.ok(found, `falta la trayectoria de ${id}`);
  return found;
}

test('un solo día de sueño en el período no se promueve a tendencia', () => {
  const result = intelligenceFor(sparsePeriodRows({ sleepDays: 1, sleepValue: 6.5 }));
  const sleep = trajectoryOf(result, 'sleep');

  // El valor observado se sigue mostrando: no se oculta ni se vuelve desconocido.
  assert.equal(sleep.coverageDays, 1);
  assert.equal(sleep.currentLabel, '6,5 h');
  assert.equal(sleep.previousLabel, '7,5 h');
  // Pero una sola observación no alcanza para una tendencia del período.
  assert.equal(sleep.material, false);
  assert.equal(sleep.tone, 'neutral');
  assert.equal(sleep.direction, 'unknown');
  assert.match(sleep.summary, /con 1 día de cobertura en el período/);
  assert.match(sleep.summary, /no alcanza para tratarlo como una tendencia/i);
  assert.notEqual(result.trajectory.headline, 'Cambio principal del período: sueño total.');
});

test('la cobertura escasa se enuncia en plural cuando hay más de un día', () => {
  const result = intelligenceFor(sparsePeriodRows({ sleepDays: 2, sleepValue: 6.5 }));
  const sleep = trajectoryOf(result, 'sleep');

  assert.equal(sleep.coverageDays, 2);
  assert.equal(sleep.material, false);
  assert.match(sleep.summary, /con 2 días de cobertura en el período/);
});

test('la evidencia escasa del período no genera la prioridad de sueño', () => {
  const result = intelligenceFor(sparsePeriodRows({ sleepDays: 1, sleepValue: 6.5 }));

  assert.equal(
    result.priorities.some((item) => item.category === 'sleep'),
    false,
  );
  assert.equal(
    result.priorities.some((item) => item.title === 'Recuperar duración de sueño'),
    false,
  );
  // La prioridad honesta con esta cobertura sigue siendo la calidad de datos.
  assert.equal(result.evidenceQuality.level, 'limited');
  assert.equal(result.priorities[0].category, 'data-quality');
  assert.match(result.priorities[0].title, /Primero necesitamos días completos/);
});

test('con cobertura suficiente el período vuelve a sostener una tendencia de sueño', () => {
  const result = intelligenceFor(
    sparsePeriodRows({ sleepDays: HEALTH_PERIOD_TREND_MIN_DAYS, sleepValue: 6.5 }),
  );
  const sleep = trajectoryOf(result, 'sleep');

  assert.equal(sleep.coverageDays, HEALTH_PERIOD_TREND_MIN_DAYS);
  assert.equal(sleep.material, true);
  assert.equal(sleep.direction, 'down');
  assert.equal(sleep.tone, 'watch');
  assert.equal(result.trajectory.headline, 'Cambio principal del período: sueño total.');
  assert.ok(result.priorities.some((item) => item.title === 'Recuperar duración de sueño'));
});

test('una observación de sueño de hoy sigue habilitando la prioridad por sí sola', () => {
  const result = intelligenceFor([
    ...baselineRows(),
    row({
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 5.8,
      [SAL.restingHr]: 55,
      [SAL.importStatus]: 'completo',
    }),
  ]);

  // La trayectoria del período no es material: la prioridad viene del día de hoy.
  assert.equal(trajectoryOf(result, 'sleep').material, false);
  assert.equal(evidenceOf(result, 'sleep').concern, true);
  const sleepPriority = result.priorities.find((item) => item.category === 'sleep');
  assert.ok(sleepPriority);
  assert.equal(sleepPriority.evidence, evidenceOf(result, 'sleep').text);
});

test('el movimiento con cobertura completa conserva su tendencia y su prioridad', () => {
  const result = intelligenceFor(
    sparsePeriodRows({ sleepDays: 7, sleepValue: 7.5, currentSteps: 4000 }),
  );
  const steps = trajectoryOf(result, 'steps');

  assert.equal(steps.coverageDays, 7);
  assert.equal(steps.material, true);
  assert.equal(steps.direction, 'down');
  assert.equal(steps.tone, 'watch');
  assert.ok(result.priorities.some((item) => item.category === 'movement'));
});

test('la trayectoria resume el período sin listar cada métrica', () => {
  const result = intelligenceFor([...baselineRows(), STABLE_TODAY]);

  assert.ok(result.trajectory.items.length <= 4);
  assert.ok(result.trajectory.items.some((item) => item.id === 'coverage'));
  assert.equal(result.trajectory.headline, 'Sin cambios materiales en el período.');
  assert.match(result.trajectory.detail, /base de 30 días/);
});

test('la página conserva métricas detalladas, historial y base personal', () => {
  const health = buildHealthPageData({
    records: parseSalud([[...HEADERS], ...baselineRows(), STABLE_TODAY]),
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'google',
    status: 'ready',
    notice: null,
  });

  assert.ok(health.metrics.some((metric) => metric.group === 'sleep'));
  assert.ok(health.metrics.some((metric) => metric.group === 'movement'));
  assert.equal(health.history.length, health.availableDays);
  assert.equal(health.signals.baselineWindowDays, 30);
  assert.equal(health.signals.baselineCoverageDays, 14);
  assert.equal(health.signals.today?.date, TODAY);
  assert.ok(health.insights.every((insight) => insight.kind !== undefined));
});

test('la UI de Salud lidera con la lectura y mantiene la evidencia debajo', () => {
  const page = readFileSync(join(process.cwd(), 'app', '(app)', 'salud', 'page.tsx'), 'utf8');
  const heroIndex = page.indexOf('<HealthTodayHero');
  const trajectoryIndex = page.indexOf('<HealthTrajectorySection');
  const changesIndex = page.indexOf('health-insights-title');
  const contextIndex = page.indexOf('<HealthContextSection');
  const prioritiesIndex = page.indexOf('<HealthPrioritiesSection');
  const historyIndex = page.indexOf('health-history-title');

  assert.ok(heroIndex > 0);
  assert.ok(heroIndex < trajectoryIndex);
  assert.ok(trajectoryIndex < changesIndex);
  assert.ok(changesIndex < contextIndex);
  assert.ok(contextIndex < prioritiesIndex);
  assert.ok(prioritiesIndex < historyIndex);
  assert.match(page, /no como diagnóstico/i);
  assert.match(page, /SparkBars/);
});
