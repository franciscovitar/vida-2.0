/**
 * Falla cerrada de la fuente real de Salud.
 *
 * Cuando `DATA_SOURCE=google` y la lectura real falla, Salud no puede rellenar
 * el hueco con el historial simulado: una conclusión personal derivada de datos
 * ficticios se lee como propia aunque haya un banner de integración.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildHealthPageData } from '@/lib/adapters/salud-period';
import { buildMockDomainRecords } from '@/lib/mock-data/domain-history';
import { REGISTRO_DIARIO_HEADERS, RD, SAL, SALUD_HEADERS } from '@/lib/google/constants';
import type { SheetReadCode } from '@/lib/google/errors';
import {
  buildHealthIntelligence,
  HEALTH_GYM_UNAVAILABLE,
  HEALTH_NUTRITION_UNAVAILABLE,
  type HealthIntelligence,
  type HealthPriorityCategory,
} from '@/lib/health/intelligence';
import { periodWindow } from '@/lib/periods';
import type { DomainPagesBundle } from '@/lib/data/domain-pages';
import type { HealthPageData } from '@/types/domain-pages';

const TODAY = '2026-09-15';

/** Códigos de fallo real que caen en el fallback del bundle. */
const REAL_SOURCE_FAILURES: readonly SheetReadCode[] = [
  'not-configured',
  'auth-error',
  'permission-error',
  'missing-tab',
  'read-error',
];

/** Categorías que afirman algo sobre el cuerpo de la persona. */
const PHYSIOLOGICAL_CATEGORIES: readonly HealthPriorityCategory[] = [
  'sleep',
  'movement',
  'cardio-recovery',
  'maintenance',
];

type BuildFromGoogle = typeof import('@/lib/data/domain-pages').buildDomainPagesFromGoogleResults;

let cachedBuild: BuildFromGoogle | null = null;

/** `domain-pages` es `server-only`; el marcador se neutraliza sólo para el test. */
async function buildFromGoogle(...args: Parameters<BuildFromGoogle>): Promise<DomainPagesBundle> {
  if (!cachedBuild) {
    const loader = Module as unknown as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    };
    const originalLoad = loader._load;
    loader._load = function patchedLoad(request, parent, isMain) {
      if (request === 'server-only') return {};
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      const mod = await import('@/lib/data/domain-pages');
      cachedBuild = mod.buildDomainPagesFromGoogleResults;
    } finally {
      loader._load = originalLoad;
    }
  }
  return cachedBuild(...args);
}

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

function okRegistroValues(): (string | number | boolean | null)[][] {
  return [
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, { [RD.fecha]: TODAY, [RD.sleep]: 7 }),
  ] as (string | number | boolean | null)[][];
}

function okSaludValues(): (string | number | boolean | null)[][] {
  return [
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 6.4,
      [SAL.restingHr]: 61,
      [SAL.steps]: 4200,
      [SAL.importStatus]: 'completo',
    }),
  ] as (string | number | boolean | null)[][];
}

function failedBundle(code: SheetReadCode): Promise<DomainPagesBundle> {
  return buildFromGoogle({ ok: false, code }, { ok: true, values: okSaludValues() }, 7, TODAY);
}

function intelligenceOf(health: HealthPageData): HealthIntelligence {
  return buildHealthIntelligence({
    health,
    gym: HEALTH_GYM_UNAVAILABLE,
    nutrition: HEALTH_NUTRITION_UNAVAILABLE,
  });
}

/** Todo el texto que la capa determinística podría mostrar como lectura personal. */
function allTexts(intelligence: HealthIntelligence): string[] {
  return [
    intelligence.currentState.headline,
    intelligence.currentState.explanation,
    ...intelligence.currentState.reasons,
    intelligence.currentState.lastInterpretable?.summary ?? '',
    intelligence.trajectory.headline,
    intelligence.trajectory.detail,
    ...intelligence.trajectory.items.map((item) => `${item.summary} ${item.currentLabel}`),
    ...intelligence.changes.map((change) => `${change.title} ${change.detail}`),
    ...intelligence.priorities.map(
      (priority) => `${priority.title} ${priority.detail} ${priority.evidence}`,
    ),
    intelligence.evidenceQuality.detail,
  ];
}

test('FC1. El modo mock explícito sigue produciendo la lectura simulada completa', () => {
  const mock = buildMockDomainRecords(TODAY);
  const health = buildHealthPageData({
    records: mock.salud,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'mock',
    notice: null,
  });

  assert.equal(health.sourceAvailable, true);
  assert.ok(health.availableDays > 0, 'el modo mock debe seguir teniendo días con datos');
  assert.ok(health.signals.baselineCoverageDays > 0, 'el modo mock conserva base personal');
  assert.ok(health.history.length > 0);
  assert.ok(health.metrics.some((metric) => metric.average !== null));

  const intelligence = intelligenceOf(health);
  assert.ok(intelligence.trajectory.items.length > 0);
  assert.ok(intelligence.priorities.length > 0);

  // El origen mock sigue alimentando el modo demo explícito en `domain-pages`.
  const source = readFileSync(join(process.cwd(), 'lib/data/domain-pages.ts'), 'utf8');
  assert.match(source, /getDataSource\(\) !== 'google'/);
  assert.match(source, /composeFromRecords\(mock\.registro, mock\.salud/);
});

test('FC2. Un fallo de lectura real no deja ninguna observación de salud simulada', async () => {
  const bundle = await failedBundle('read-error');
  const health = bundle.health;

  assert.equal(health.sourceAvailable, false);
  assert.equal(health.availableDays, 0);
  assert.equal(health.history.length, 0);
  assert.equal(health.signals.today, null);
  assert.equal(health.completeDays, 0);
  assert.equal(health.partialDays, 0);

  for (const metric of health.metrics) {
    assert.equal(metric.average, null, `${metric.id} no puede tener promedio simulado`);
    assert.equal(metric.coverageDays, 0);
    assert.ok(
      metric.series.every((value) => value === null),
      `${metric.id} no puede tener serie simulada`,
    );
  }

  // Valores exactos observados en QA cuando el generador mock ocupaba el hueco.
  const serialized = JSON.stringify(health);
  for (const mockValue of [7.7, 57, 48, 5360]) {
    assert.equal(
      serialized.includes(String(mockValue)),
      false,
      `el valor simulado ${mockValue} no puede aparecer en Salud`,
    );
  }

  // Las tendencias tampoco cuentan días de salud inventados.
  assert.equal(bundle.trends.coverage.healthDays, 0);
});

test('FC3. Ningún código de fallo real produce base personal ni tendencias simuladas', async () => {
  for (const code of REAL_SOURCE_FAILURES) {
    const health = (await failedBundle(code)).health;
    assert.equal(health.sourceAvailable, false, code);
    assert.equal(health.baselineDays, 0, code);
    assert.equal(health.signals.baselineCoverageDays, 0, code);
    for (const signal of Object.values(health.signals.baseline)) {
      assert.equal(signal.average, null, `${code}: la base personal debe quedar desconocida`);
      assert.equal(signal.days, 0, code);
    }

    const intelligence = intelligenceOf(health);
    assert.equal(intelligence.trajectory.items.length, 0, `${code}: no puede haber trayectoria`);
    assert.equal(intelligence.currentState.evidence.length, 0, `${code}: no puede haber evidencia`);
  }
});

test('FC4. Un encabezado faltante en la fuente real también falla cerrado', async () => {
  const bundle = await buildFromGoogle(
    { ok: true, values: [['columna inesperada'], ['x']] },
    { ok: true, values: okSaludValues() },
    7,
    TODAY,
  );
  assert.equal(bundle.health.status, 'missing-header');
  assert.equal(bundle.health.sourceAvailable, false);
  assert.equal(bundle.health.availableDays, 0);
  assert.equal(bundle.health.signals.today, null);
});

test('FC5. El estado actual queda insuficiente y nunca en una lectura personal', async () => {
  for (const code of REAL_SOURCE_FAILURES) {
    const state = intelligenceOf((await failedBundle(code)).health).currentState;
    assert.equal(state.kind, 'insufficient-data', code);
    assert.equal(state.sourceAvailable, false, code);
    assert.notEqual(state.kind as string, 'normal-for-you');
    assert.notEqual(state.kind as string, 'watch');
    assert.notEqual(state.kind as string, 'below-usual');
    assert.equal(state.headline, 'Datos de salud no disponibles');
    assert.match(state.explanation, /No pudimos leer la fuente real/);
    assert.equal(state.coreAvailable.length, 0, code);
  }
});

test('FC6. Ningún día simulado se presenta como último día interpretable', async () => {
  for (const code of REAL_SOURCE_FAILURES) {
    const health = (await failedBundle(code)).health;
    assert.equal(health.signals.lastInterpretable, null, code);

    const intelligence = intelligenceOf(health);
    assert.equal(intelligence.currentState.lastInterpretable, null, code);
    for (const text of allTexts(intelligence)) {
      assert.doesNotMatch(text, /Último día interpretable/i, code);
    }
  }
});

test('FC7. El fallback real no emite ninguna prioridad fisiológica', async () => {
  for (const code of REAL_SOURCE_FAILURES) {
    const priorities = intelligenceOf((await failedBundle(code)).health).priorities;
    assert.equal(priorities.length, 1, code);
    assert.equal(priorities[0].category, 'data-quality', code);
    assert.equal(priorities[0].id, 'source-unavailable', code);
    for (const priority of priorities) {
      assert.equal(
        PHYSIOLOGICAL_CATEGORIES.includes(priority.category),
        false,
        `${code}: ${priority.category} sería una conclusión sin dato real`,
      );
    }
  }
});

test('FC8. La indisponibilidad se informa y conserva el banner de integración', async () => {
  const bundle = await failedBundle('auth-error');
  assert.equal(bundle.health.status, 'auth-error');
  assert.equal(
    bundle.health.notice,
    'Datos de salud no disponibles. No pudimos leer la fuente real en este momento.',
  );
  assert.equal(bundle.health.today.kind, 'missing');
  assert.match(bundle.health.today.label, /Fuente no disponible/);
  assert.equal(bundle.health.insights.length, 1);
  assert.equal(bundle.health.insights[0].id, 'source-unavailable');

  // Hábitos y productividad conservan su aviso simulado previo.
  assert.equal(
    bundle.habits.notice,
    'No se pudo autenticar con Google. Mostrando datos simulados.',
  );
  assert.equal(
    bundle.productivity.notice,
    'No se pudo autenticar con Google. Mostrando datos simulados.',
  );
});

test('FC9. La lectura real exitosa no cambia', async () => {
  const bundle = await buildFromGoogle(
    { ok: true, values: okRegistroValues() },
    { ok: true, values: okSaludValues() },
    7,
    TODAY,
  );
  const health = bundle.health;

  assert.equal(health.sourceAvailable, true);
  assert.equal(health.source, 'google');
  assert.equal(health.availableDays, 1);
  assert.equal(health.signals.today?.values.sleep, 6.4);
  assert.equal(health.signals.today?.values.restingHr, 61);
  assert.equal(health.today.kind, 'complete');

  const intelligence = intelligenceOf(health);
  assert.equal(intelligence.currentState.sourceAvailable, true);
  assert.ok(intelligence.trajectory.items.length > 0);
});

test('FC10. Gimnasio y nutrición informan su estado sin convertirlo en conclusión física', async () => {
  const health = (await failedBundle('permission-error')).health;
  const intelligence = buildHealthIntelligence({
    health,
    gym: { state: 'ready', sessions: [{ date: TODAY, completed: true }] },
    nutrition: {
      state: 'ready',
      todayEnergyCoverage: 'complete',
      todayTrackedMeals: 3,
      history: [{ date: TODAY, trackedMealCount: 3, energyCoverage: 'complete' }],
    },
  });

  assert.equal(intelligence.crossDomain.gym.state, 'ready');
  assert.equal(intelligence.crossDomain.nutrition.state, 'ready');
  assert.equal(intelligence.currentState.kind, 'insufficient-data');
  assert.equal(intelligence.priorities.length, 1);
  assert.equal(intelligence.priorities[0].category, 'data-quality');
});
