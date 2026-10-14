import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { integrationFixture } from './helpers/phase4-integration-fixtures';
import { EVIDENCE_STATES } from './helpers/phase4-surface-fixtures';

const require = createRequire(import.meta.url);
const oldScss = require.extensions['.scss'];
require.extensions['.scss'] = (module) => {
  module.exports = new Proxy(
    {},
    { get: (_t, key) => (key === '__esModule' ? false : String(key)) },
  );
};
const actions = require.resolve('@/app/actions/tasks');
const oldActions = require.cache[actions];
require.cache[actions] = {
  id: actions,
  filename: actions,
  loaded: true,
  exports: new Proxy(
    {},
    {
      get: () => () => {
        throw Error('Mutations forbidden in QA');
      },
    },
  ),
} as NodeModule;
const { HabitsV2Board } =
  require('@/components/habits/HabitsV2Board') as typeof import('@/components/habits/HabitsV2Board');
const { TaskManager } =
  require('@/components/planning/TaskManager') as typeof import('@/components/planning/TaskManager');
after(() => {
  if (oldScss) require.extensions['.scss'] = oldScss;
  else delete require.extensions['.scss'];
  if (oldActions) require.cache[actions] = oldActions;
  else delete require.cache[actions];
});
const forbidden = () => {
  throw Error('Router events require browser QA');
};
const router: AppRouterInstance = {
  back: forbidden,
  forward: forbidden,
  refresh: forbidden,
  push: forbidden,
  replace: forbidden,
  prefetch: forbidden,
};

for (const state of EVIDENCE_STATES) {
  test(`Integrated Habits/${state} never publishes write controls or false absence`, () => {
    const fixture = integrationFixture(state);
    const html = renderToStaticMarkup(
      createElement(
        AppRouterContext.Provider,
        { value: router },
        createElement(HabitsV2Board, fixture.habits),
      ),
    );
    assert.match(html, /escritor sigue desconectado/);
    assert.doesNotMatch(html, /Nuevo hábito|Desactivar|Crear/);
    assert.match(html, /Fecha de hábitos/);
    if (state === 'error') {
      assert.match(html, /role="status"/);
      assert.doesNotMatch(html, /No hay hábitos activos/);
    }
    if (state === 'partial' || state === 'stale') {
      assert.match(html, /No disponible/);
      assert.doesNotMatch(html, /Semana 0\/3/);
    }
  });
}
test('Habits ignores an erroneously writable DTO at its client boundary', () => {
  const fixture = integrationFixture('complete');
  fixture.habits.view.writable = true;
  const html = renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(HabitsV2Board, fixture.habits),
    ),
  );
  assert.match(html, /role="checkbox"[^>]*disabled/);
  assert.doesNotMatch(html, /Nuevo hábito|Desactivar/);
});
test('Read-only Habits import graph has no mutation action, port or exclusive writer', () => {
  for (const path of ['components/habits/HabitsV2Board.tsx', 'lib/habits/v2-source.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /app\/actions|v2-write-core|v2-google-port|exclusiveWriter/);
  }
  assert.match(readFileSync('lib/habits/v2-source.ts', 'utf8'), /writable: false/);
});
test('Actions use the same typed dates as Semana and remain disabled', () => {
  const fixture = integrationFixture('complete');
  const html = renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(TaskManager, {
        catalog: fixture.week.taskCatalog,
        writable: false,
        dateSemanticsV2: true,
      }),
    ),
  );
  assert.match(html, /Deadline/);
  assert.match(html, /Objetivo/);
  assert.match(html, /Revisión/);
  assert.match(html, /Sin tipo/);
  assert.match(html, /disabled/);
});

test('Unknown weekly coverage stays unknown even when the reader has a zero accumulator', () => {
  const fixture = integrationFixture('partial');
  const html = renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(HabitsV2Board, fixture.habits),
    ),
  );
  assert.match(html, /Semana sin confirmar · cobertura parcial/);
  assert.doesNotMatch(html, /Semana 0\/3/);
});
test('Confirmed full weekly coverage can display a real measured zero', () => {
  const fixture = integrationFixture('complete');
  fixture.habits.view.items = fixture.habits.view.items.map((item) =>
    item.cadence === 'weekly'
      ? { ...item, value: false, state: 'pending', weeklyCompleted: 0 }
      : item,
  );
  const html = renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(HabitsV2Board, fixture.habits),
    ),
  );
  assert.match(html, /Semana 0\/3/);
});
