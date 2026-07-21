import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isJsonPlain, sanitizeCell, sanitizeSheetValues, toPlainTodayData } from '@/lib/data/plain';
import { absorbGoogleFetchFailure, buildTodayFromGoogleResults } from '@/lib/data/sheet-today';
import { composeHoyData, loadTodayDataWith, mockCalendarLoader } from '@/lib/data/compose-today';
import { buildMockToday } from '@/lib/adapters/mock';
import { emptyCalendarTodayPreview } from '@/lib/calendar/summaries';
import { buildMockNotionDashboard } from '@/lib/mock-data/notion';
import { mapGoogleFailure } from '@/lib/google/sheets-read';
import { REGISTRO_DIARIO_HEADERS, SALUD_HEADERS } from '@/lib/google/constants';
import { summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';

test('sanitizeCell descarta Buffer y ArrayBuffer', () => {
  assert.equal(sanitizeCell(Buffer.from('hola')), 'hola');
  assert.equal(sanitizeCell(new ArrayBuffer(8)), null);
  assert.equal(sanitizeCell(new Uint8Array([1, 2])), null);
  assert.equal(sanitizeCell({ foo: 'bar' }), null);
});

test('sanitizeSheetValues produce una matriz JSON plana', () => {
  const values = sanitizeSheetValues([['texto', 0, false, Buffer.from('x'), new ArrayBuffer(4)]]);
  assert.deepEqual(values, [['texto', 0, false, 'x', null]]);
  assert.equal(isJsonPlain(values), true);
});

test('toPlainTodayData produce JSON serializable sin Error ni Buffer', () => {
  const mock = buildMockToday();
  const poisoned = {
    ...mock,
    __gaxios: new Error('leak') as unknown,
    __buffer: new ArrayBuffer(8) as unknown,
  };
  const plain = toPlainTodayData(poisoned as typeof mock);
  assert.equal(isJsonPlain(plain), true);
  const json = JSON.stringify(plain);
  assert.doesNotThrow(() => JSON.parse(json));
  assert.equal(json.includes('gaxios'), false);
});

test('mapGoogleFailure descarta GaxiosError con ArrayBuffer en response', () => {
  const gaxiosLike = {
    status: 401,
    message: 'Unauthorized',
    response: { status: 401, data: new ArrayBuffer(16) },
    config: { headers: { Authorization: 'secret' } },
  };
  assert.equal(mapGoogleFailure(gaxiosLike, 'Registro diario'), 'auth-error');
});

test('mapGoogleFailure mapea 403 a permission-error', () => {
  assert.equal(mapGoogleFailure({ status: 403 }, 'Salud y experimentos'), 'permission-error');
});

test('código auth-error produce fallback plano serializable', () => {
  const data = buildTodayFromGoogleResults(
    { ok: false, code: 'auth-error' },
    { ok: true, values: [[...SALUD_HEADERS]] },
  );
  assert.equal(data.status, 'auth-error');
  assert.match(data.notice ?? '', /autenticar/i);
  assert.equal(isJsonPlain(data), true);
  assert.doesNotThrow(() => JSON.stringify(data));
  assert.equal(typeof data.summary.habits.value, 'string');
});

test('absorbGoogleFetchFailure captura Error con ArrayBuffer en cause', () => {
  const err = new Error('fallo simulado') as Error & {
    cause: { buffer: ArrayBuffer };
    response: { data: ArrayBuffer };
  };
  err.cause = { buffer: new ArrayBuffer(16) };
  err.response = { data: new ArrayBuffer(8) };

  const data = absorbGoogleFetchFailure(err);
  assert.equal(data.status, 'read-error');
  assert.equal(isJsonPlain(data), true);
  assert.doesNotThrow(() => JSON.stringify(data));
});

test('DATA_SOURCE=mock devuelve datos planos serializables', async () => {
  const data = await loadTodayDataWith({
    loadSheet: async () => buildMockToday(),
    loadNotionDashboard: async () => {
      const base = buildMockNotionDashboard('2026-07-20');
      return {
        ...base,
        source: 'mock',
        status: 'mock',
        notice: null,
        syncedAt: '2026-07-20T12:00:00.000Z',
        taskSummary: summarizeTasks(base.tasks),
        projectSummary: summarizeProjects(base.projects),
      };
    },
    loadCalendar: mockCalendarLoader(),
  });
  assert.equal(data.source, 'mock');
  assert.ok(data.calendar);
  assert.equal(data.sources.length, 3);
  assert.equal(isJsonPlain(data), true);
  assert.doesNotThrow(() => JSON.stringify(data));
  assert.doesNotThrow(() => structuredClone(data));
});

test('DATA_SOURCE=google sin credenciales Sheet produce fallback plano', async () => {
  const data = await loadTodayDataWith({
    loadSheet: async () =>
      buildTodayFromGoogleResults(
        { ok: false, code: 'not-configured' },
        { ok: true, values: [[...SALUD_HEADERS]] },
      ),
    loadNotionDashboard: async () => null,
    loadCalendar: mockCalendarLoader(
      emptyCalendarTodayPreview({
        source: 'google',
        status: 'not-configured',
        notice: 'Integración con Google Calendar no configurada.',
      }),
    ),
  });
  assert.equal(data.status, 'not-configured');
  assert.equal(isJsonPlain(data), true);
  assert.doesNotThrow(() => JSON.stringify(data));
  assert.equal(data.calendar.status, 'not-configured');
});

test('composeHoyData produce DTO plano con tres fuentes', () => {
  const composed = composeHoyData(
    buildMockToday(),
    null,
    emptyCalendarTodayPreview({ source: 'mock', status: 'mock' }),
  );
  assert.equal(isJsonPlain(composed), true);
  assert.ok(composed.sources.some((s) => s.id === 'calendar'));
});

test('buildTodayFromGoogleResults con datos válidos devuelve objeto plano', () => {
  const data = buildTodayFromGoogleResults(
    { ok: true, values: [[...REGISTRO_DIARIO_HEADERS]] },
    { ok: true, values: [[...SALUD_HEADERS]] },
  );
  assert.equal(isJsonPlain(data), true);
  assert.doesNotThrow(() => JSON.stringify(data));
});
