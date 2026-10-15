import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildMockToday } from '@/lib/adapters/mock';
import { emptyCalendarTodayPreview } from '@/lib/calendar/summaries';
import { shouldRenderStagedDailyOrientationV2 } from '@/lib/daily-planning/orientation-rollout';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';
import type { CalendarIntegrationStatus } from '@/types/calendar';

// Node SSR needs a CSS-module loader. Only class names are substituted, not React,
// data adapters, components, readers or providers. This is not browser/CSS QA.
const require = createRequire(import.meta.url);
const oldScss = require.extensions['.scss'];
require.extensions['.scss'] = (module) => {
  module.exports = new Proxy(
    {},
    { get: (_target, key) => (key === '__esModule' ? false : String(key)) },
  );
};
const { DailyAttentionPanel, DailyRealityReviewPanel } =
  require('@/components/planning/DailyOrientationPanels') as typeof import('@/components/planning/DailyOrientationPanels');
const { TodayCockpitV2 } =
  require('@/components/dashboard/TodayCockpitV2') as typeof import('@/components/dashboard/TodayCockpitV2');
after(() => {
  if (oldScss) require.extensions['.scss'] = oldScss;
  else delete require.extensions['.scss'];
});

function orientation(patch: Partial<DailyOrientationView> = {}): DailyOrientationView {
  return {
    status: 'unavailable',
    readStatus: 'unavailable',
    notice: 'No se pudo autenticar la fuente de orientación.',
    targetDate: '2026-10-13',
    generatedAt: null,
    review: null,
    attention: [],
    upcoming: [],
    lifeSignals: [],
    minimum: [],
    notNow: [],
    quality: { unresolvedRefs: 0, dateConflicts: 0, invalidRows: 0 },
    ...patch,
  };
}
function cockpit(view: DailyOrientationView, calendarUnavailable = false) {
  const today = buildMockToday();
  today.calendar = emptyCalendarTodayPreview({
    source: 'google',
    status: calendarUnavailable ? 'auth-error' : 'ready',
    notice: calendarUnavailable ? 'Calendar no está autenticado.' : null,
  });
  return renderToStaticMarkup(createElement(TodayCockpitV2, { today, orientation: view }));
}

test('Prioridades exposes a read failure as an accessible status, never confirmed absence', () => {
  const view = orientation();
  assert.equal(shouldRenderStagedDailyOrientationV2(true, view), true);
  const html = renderToStaticMarkup(createElement(DailyAttentionPanel, { orientation: view }));
  assert.match(html, /role="status"/);
  assert.match(html, /No se pudo autenticar la fuente de orientación/);
  assert.doesNotMatch(html, /Sin orientación V2 persistida/);
});
test('Revisión cannot describe an unreadable snapshot as absent', () => {
  const html = renderToStaticMarkup(
    createElement(DailyRealityReviewPanel, { orientation: orientation() }),
  );
  assert.doesNotMatch(html, /Todavía no hay una revisión V2 persistida/);
  assert.match(html, /No se pudo verificar la revisión V2/);
});
test('Hoy distinguishes unreadable orientation and Calendar from empty successful reads', () => {
  const html = cockpit(orientation(), true);
  assert.match(html, /Calendar no está autenticado/);
  assert.match(html, /No se puede confirmar que la agenda esté libre/);
  assert.doesNotMatch(html, /Todavía no hay una orientación V2 persistida para hoy/);
  assert.doesNotMatch(html, /Sin revisión V2 persistida/);
  assert.doesNotMatch(html, /Sin señal adicional de recuperación/);
});
test('a valid no-change remains visible and does not become an error', () => {
  const view = orientation({
    status: 'ready',
    readStatus: 'ready',
    notice: null,
    review: { date: '2026-10-12', headline: 'Sin cambio propuesto', items: [], uncertainties: [] },
  });
  assert.match(cockpit(view), /No cambiaría nada importante/);
  assert.match(
    renderToStaticMarkup(createElement(DailyAttentionPanel, { orientation: view })),
    /No hay un ajuste importante persistido/,
  );
});
test('staged empty reads keep V2 visible; failures remain visible; flag off retains V1', () => {
  assert.equal(
    shouldRenderStagedDailyOrientationV2(true, orientation({ readStatus: 'empty' })),
    true,
  );
  assert.equal(
    shouldRenderStagedDailyOrientationV2(true, orientation({ readStatus: 'invalid' })),
    true,
  );
  assert.equal(shouldRenderStagedDailyOrientationV2(false, orientation()), false);
});

for (const readStatus of ['unavailable', 'invalid'] as const) {
  test(`${readStatus} without a source notice still has an accessible explanation on every V2 panel`, () => {
    const view = orientation({ readStatus, notice: null });
    for (const Panel of [DailyRealityReviewPanel, DailyAttentionPanel]) {
      const html = renderToStaticMarkup(createElement(Panel, { orientation: view }));
      assert.match(html, /role="status"/);
      assert.match(html, /No se pudo verificar/);
      assert.doesNotMatch(html, /Todavía no hay|Sin orientación V2 persistida/);
    }
    assert.match(cockpit(view), /role="status"/);
    assert.doesNotMatch(cockpit(view), /Todavía no hay|No cambiaría nada importante/);
  });
}
for (const field of ['unresolvedRefs', 'dateConflicts'] as const) {
  test(`filtered ${field} cannot masquerade as a verified no-change`, () => {
    const view = orientation({
      status: 'degraded',
      readStatus: 'ready',
      notice: 'Una referencia ya no pudo verificarse.',
      review: { date: '2026-10-12', headline: 'Revisión sintética', items: [], uncertainties: [] },
      quality: { unresolvedRefs: 0, dateConflicts: 0, invalidRows: 0, [field]: 1 },
    });
    const html =
      cockpit(view) +
      renderToStaticMarkup(createElement(DailyAttentionPanel, { orientation: view }));
    assert.match(html, /No hay prioridades verificables con las fuentes actuales/);
    assert.doesNotMatch(
      html,
      /No cambiaría nada importante|No hay un ajuste importante persistido/,
    );
  });
}
const calendarFailures: CalendarIntegrationStatus[] = [
  'not-configured',
  'auth-error',
  'permission-error',
  'invalid-calendar-id',
  'calendar-not-found',
  'rate-limited',
  'network-error',
  'read-error',
];
for (const status of calendarFailures) {
  test(`Calendar ${status} remains unknown while independently verified upcoming dates remain visible`, () => {
    const today = buildMockToday();
    today.calendar = emptyCalendarTodayPreview({ source: 'google', status, notice: null });
    const view = orientation({
      status: 'degraded',
      readStatus: 'ready',
      notice: null,
      upcoming: [
        {
          kind: 'assessment',
          title: 'Evaluación sintética confirmada',
          date: '2026-10-17',
          dateType: 'assessment',
          reason: 'Fecha confirmada en su fuente',
        },
      ],
    });
    const html = renderToStaticMarkup(createElement(TodayCockpitV2, { today, orientation: view }));
    assert.match(html, /Calendar no está disponible/);
    assert.match(html, /No se puede confirmar que la agenda esté libre/);
    assert.match(html, /Evaluación sintética confirmada/);
  });
}
test('a successful empty Calendar read does not receive an outage warning', () => {
  const html = cockpit(orientation({ status: 'ready', readStatus: 'ready', notice: null }));
  assert.doesNotMatch(
    html,
    /Calendar no está disponible|No se puede confirmar que la agenda esté libre/,
  );
  assert.match(html, /No hay una fecha próxima V2/);
});
