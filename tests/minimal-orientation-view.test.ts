import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { buildMinimalOrientationView } from '@/lib/daily-planning/minimal-orientation-view';
import { selectLatestDailyOrientationSnapshot } from '@/lib/daily-planning/orientation-v2';
import type { DailyOrientationPayload } from '@/types/daily-orientation-v2';

const DAY = '2026-10-15';
const HEADER = ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'];
const payload: DailyOrientationPayload = {
  review: { date: '2026-10-14', headline: 'Un día de avances declarados.', items: [], uncertainties: [] },
  attention: [{
    domain: 'university', targetKind: 'subject', ref: null, title: 'Materia',
    recommendation: 'Repasar un concepto.', why: 'Hace días que no se practica.',
    confidence: 'Media', nextAction: 'Una variante nueva.',
  }],
  upcoming: [{
    kind: 'assessment', ref: null, title: 'Próxima evaluación',
    date: '2026-10-20', dateType: 'unknown', reason: 'Fecha seleccionada en la revisión.',
  }],
  lifeSignals: [],
  minimum: [{ domain: 'personal', title: 'Descanso', why: 'Cuidar la recuperación.', ref: null }],
  notNow: [],
};
function read(body: DailyOrientationPayload = payload) {
  return selectLatestDailyOrientationSnapshot([
    HEADER,
    [
      'vida2:tasks-daily-planning:v2:orientation:2026-10-15:fixture',
      DAY,
      '2026-10-15T08:00:00-03:00',
      JSON.stringify(body),
      'chatgpt_project',
      'daily-orientation-v2',
    ],
  ], DAY);
}

test('MIN-VIEW1: snapshot-only V2 shows all unreferenced ChatGPT recommendations', () => {
  const view = buildMinimalOrientationView(read(), DAY);
  assert.equal(view.status, 'ready');
  assert.equal(view.readStatus, 'ready');
  assert.equal(view.review?.date, '2026-10-14');
  assert.equal(view.attention.length, 1);
  assert.equal(view.upcoming.length, 1);
  assert.equal(view.minimum.length, 1);
  assert.equal(view.generatedAt, '2026-10-15T08:00:00-03:00');
  assert.doesNotMatch(JSON.stringify(view), /:fixture|"ref":/);
});

test('MIN-VIEW2: no live source lookup can silently certify ref-bearing items', () => {
  const entry = { ...payload.attention[0]!, ref: 'subject-secret' };
  const deadline = { ...payload.upcoming[0]!, ref: 'unknown-provider-ref' };
  const body = { ...payload, attention: [entry], upcoming: [deadline] };
  const view = buildMinimalOrientationView(read(body), DAY);
  assert.equal(view.status, 'degraded');
  assert.equal(view.attention.length, 0);
  assert.equal(view.upcoming.length, 0);
  assert.equal(view.quality.unresolvedRefs, 2);
  assert.match(view.notice ?? '', /2 entrada/);
  assert.doesNotMatch(JSON.stringify(view), /subject-secret|unknown-provider-ref/);
});

test('MIN-VIEW3: empty and unavailable are different truthful states', () => {
  const empty = buildMinimalOrientationView(
    { status: 'empty', snapshot: null, notice: null, invalidRows: 0 }, DAY,
  );
  const broken = buildMinimalOrientationView(
    { status: 'unavailable', snapshot: null, notice: 'Sheet inaccessible', invalidRows: 0 },
    DAY,
  );
  assert.equal(empty.status, 'empty');
  assert.equal(empty.generatedAt, null);
  assert.equal(broken.status, 'unavailable');
  assert.equal(broken.notice, 'Sheet inaccessible');
});

test('MIN-VIEW4: V2 transport depends on Sheets only; V1 remains separate', () => {
  const file = readFileSync('lib/data/daily-orientation-v2-source.ts', 'utf8');
  assert.match(file, /readTabValues\(DAILY_PLAN_TAB\)/);
  assert.match(file, /requireAuthorizedSession/);
  assert.doesNotMatch(file, /loadDailyPlanningContextUncached|loadCalendar|loadNotion|loadAssessments/);
});
