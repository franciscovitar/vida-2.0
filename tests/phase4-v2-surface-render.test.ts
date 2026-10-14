import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildMockToday } from '@/lib/adapters/mock';
import { EVIDENCE_STATES, surfaceFixture } from './helpers/phase4-surface-fixtures';

const require = createRequire(import.meta.url);
const oldScss = require.extensions['.scss'];
require.extensions['.scss'] = (module) => {
  module.exports = new Proxy(
    {},
    { get: (_target, key) => (key === '__esModule' ? false : String(key)) },
  );
};
// Semana never renders TaskManager. Reject server actions instead of loading
// Auth.js/provider modules in plain Node; no auth or action behavior is tested.
const actionsPath = require.resolve('@/app/actions/tasks');
const oldActions = require.cache[actionsPath];
require.cache[actionsPath] = {
  id: actionsPath,
  filename: actionsPath,
  loaded: true,
  exports: new Proxy(
    {},
    {
      get: () => () => {
        throw new Error('Provider actions forbidden in component QA');
      },
    },
  ),
} as NodeModule;
const { PlanningWorkspaceV2 } =
  require('@/components/planning/PlanningWorkspaceV2') as typeof import('@/components/planning/PlanningWorkspaceV2');
const { LearningHubV2 } =
  require('@/components/learning/LearningHubV2') as typeof import('@/components/learning/LearningHubV2');
const { ProjectsIntelligenceDashboard } =
  require('@/components/projects/ProjectsIntelligenceDashboard') as typeof import('@/components/projects/ProjectsIntelligenceDashboard');
const { TodayCockpitV2 } =
  require('@/components/dashboard/TodayCockpitV2') as typeof import('@/components/dashboard/TodayCockpitV2');
after(() => {
  if (oldScss) require.extensions['.scss'] = oldScss;
  else delete require.extensions['.scss'];
  if (oldActions) require.cache[actionsPath] = oldActions;
  else delete require.cache[actionsPath];
});
for (const state of EVIDENCE_STATES) {
  test(`Semana/${state}: evidence remains qualified and navigation is preserved`, () => {
    const html = renderToStaticMarkup(
      createElement(PlanningWorkspaceV2, surfaceFixture(state).week),
    );
    assert.match(html, /Vistas de planificación V2/);
    if (state === 'complete') {
      assert.match(html, /Ver 2 fechas adicionales/);
      assert.match(html, /Ver 2 tareas adicionales/);
      assert.match(html, /Deadline/);
      assert.match(html, /Objetivo/);
      assert.match(html, /Revisión/);
      assert.match(html, /Fecha sin tipo/);
    }
    assert.match(html, /\/planificacion\?view=acciones/);
    if (state === 'error') {
      assert.match(html, /role="status"/);
      assert.match(html, /La orientación diaria no está disponible/);
    }
    if (state === 'partial') {
      assert.match(html, /Lectura académica parcial sintética/);
      assert.match(html, /sin medir/);
    }
    if (state === 'stale') {
      assert.match(html, /preparación sin medir/);
      assert.doesNotMatch(html, /65%/);
      assert.match(html, /materia cambió después/);
    }
    if (state === 'stale')
      assert.match(html, /2026-09-01[\s\S]*no demuestra práctica independiente reciente/);
    if (state === 'absent') assert.match(html, /no significa que Calendar/);
  });
  test(`Aprendizaje/${state}: missing or incompatible evidence never becomes zero mastery`, () => {
    const html = renderToStaticMarkup(createElement(LearningHubV2, surfaceFixture(state).learning));
    if (state === 'error') {
      assert.match(html, /role="status"/);
      assert.match(html, /No se pudo verificar el catálogo/);
      assert.doesNotMatch(html, /No hay materias activas verificables/);
    }
    if (state === 'partial' || state === 'stale') {
      assert.match(html, /Preparación sin medir/);
      assert.doesNotMatch(html, /Preparación 0%/);
    }
    if (state === 'stale') assert.match(html, /materia cambió después/);
    if (state === 'complete') assert.match(html, /Preparación 65%/);
    assert.match(html, /\/aprendizaje\/ingles/);
  });
  test(`Proyectos/${state}: canonical measured zero differs from missing milestones`, () => {
    const html = renderToStaticMarkup(
      createElement(ProjectsIntelligenceDashboard, surfaceFixture(state).projects),
    );
    if (state === 'error') {
      assert.match(html, /Projects Intelligence no está disponible/);
      assert.doesNotMatch(html, /Ningún proyecto en foco/);
    }
    if (state === 'partial') {
      assert.match(html, /[Ss]in medir/);
      assert.doesNotMatch(html, />0%</);
    }
    if (state === 'complete') assert.match(html, /0%/);
    if (state === 'stale') assert.match(html, /Snapshot pendiente de revisión/);
    if (state === 'absent') assert.match(html, /No hay proyectos en las bases canónicas/);
  });
}

test('Semana refuses measured preparation without complete exam scope', () => {
  const fixture = surfaceFixture('complete');
  const snapshot = fixture.week.assessments.snapshots[0];
  fixture.week.assessments.snapshots = [
    {
      ...snapshot,
      payload: { ...snapshot.payload, scopeComplete: false, readinessBand: 'exam-ready' },
    },
  ];
  const html = renderToStaticMarkup(createElement(PlanningWorkspaceV2, fixture.week));
  assert.match(html, /preparación sin medir/);
  assert.doesNotMatch(html, /65%|exam-ready/);
});
test('Aprendizaje rejects retained progress from a failed read, even with no notice', () => {
  const fixture = surfaceFixture('complete');
  fixture.learning.assessmentProgress.status = 'invalid';
  const html = renderToStaticMarkup(createElement(LearningHubV2, fixture.learning));
  assert.match(html, /No se pudo verificar Assessment Progress/);
  assert.match(html, /Preparación sin medir/);
  assert.doesNotMatch(html, /Preparación 65%/);
});
test('Hoy keeps independent health values visible when orientation cannot be verified', () => {
  const today = buildMockToday();
  const orientation = surfaceFixture('error').week.orientation;
  const html = renderToStaticMarkup(createElement(TodayCockpitV2, { today, orientation }));
  assert.match(html, /Métricas de Salud · lectura independiente de la orientación V2/);
  assert.ok(html.includes(today.summary.sleep.value));
  assert.ok(html.includes(today.summary.energy.value));
  assert.ok(html.includes(today.health.steps.value));
  assert.match(html, /No se pudieron verificar las señales V2/);
  assert.match(html, /Datos simulados/);
});

test('Semana reconciles a conflicting snapshot date with the official catalog date', () => {
  const fixture = surfaceFixture('complete');
  const subject = fixture.week.studyCatalog.subjects[0];
  assert.ok(subject.assessment);
  fixture.week.studyCatalog.subjects = [
    { ...subject, assessment: { ...subject.assessment, date: '2026-11-10' } },
  ];
  const html = renderToStaticMarkup(createElement(PlanningWorkspaceV2, fixture.week));
  assert.doesNotMatch(html, /Evaluación sintética/);
  assert.doesNotMatch(html, /preparación 65%/);
});
