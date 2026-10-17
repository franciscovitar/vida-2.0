import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildMinimalOrientationView } from '@/lib/daily-planning/minimal-orientation-view';

const require = createRequire(import.meta.url);
const oldScss = require.extensions['.scss'];
require.extensions['.scss'] = (module) => {
  module.exports = new Proxy(
    {},
    { get: (_target, key) => (key === '__esModule' ? false : String(key)) },
  );
};
const { MinimalPlanningOverview } =
  require('@/components/planning/MinimalPlanningOverview') as typeof import('@/components/planning/MinimalPlanningOverview');
after(() => {
  if (oldScss) require.extensions['.scss'] = oldScss;
  else delete require.extensions['.scss'];
});

for (const status of ['unavailable', 'invalid'] as const) {
  test(`minimal planning ${status} read never claims that no analysis or dates were saved`, () => {
    const orientation = buildMinimalOrientationView(
      { status, snapshot: null, notice: null, invalidRows: status === 'invalid' ? 1 : 0 },
      '2030-01-01',
    );
    const html = renderToStaticMarkup(createElement(MinimalPlanningOverview, { orientation }));
    assert.match(html, /No se pudo verificar el análisis guardado/);
    assert.match(html, /No se pudieron verificar las próximas fechas/);
    assert.doesNotMatch(html, /Todavía no hay un análisis|No hay próximas fechas confirmadas/);
  });
}

test('minimal planning shows no saved analysis only after a confirmed empty read', () => {
  const orientation = buildMinimalOrientationView(
    { status: 'empty', snapshot: null, notice: null, invalidRows: 0 },
    '2030-01-01',
  );
  const html = renderToStaticMarkup(createElement(MinimalPlanningOverview, { orientation }));
  assert.match(html, /Todavía no hay un análisis guardado/);
  assert.match(html, /No hay próximas fechas confirmadas en este análisis/);
  assert.doesNotMatch(html, /No se pudo verificar el análisis guardado/);
});

test('minimal planning preserves the saved timestamp after a successful read', () => {
  const orientation = {
    ...buildMinimalOrientationView(
      { status: 'empty', snapshot: null, notice: null, invalidRows: 0 },
      '2030-01-01',
    ),
    status: 'ready' as const,
    readStatus: 'ready' as const,
    generatedAt: '2030-01-01T12:00:00Z',
  };
  const html = renderToStaticMarkup(createElement(MinimalPlanningOverview, { orientation }));
  assert.match(html, /Último análisis guardado/);
  assert.match(html, /datetime="2030-01-01T12:00:00Z"/i);
  assert.doesNotMatch(html, /Todavía no hay un análisis|No se pudo verificar el análisis guardado/);
});
