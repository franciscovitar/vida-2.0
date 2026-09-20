import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HEALTH_RHYTHM_FEATURE_VERSION,
  HEALTH_RHYTHM_FEATURES_HEADERS,
  HEALTH_RHYTHM_FEATURES_TAB,
  buildRhythmFeaturesViewModel,
  loadRhythmFeaturesSnapshot,
  parseRhythmFeatureValues,
} from '@/lib/health/rhythm-features-sheet';
import { buildRhythmStability } from '@/lib/health/rhythm';
import type { ReadTabResult } from '@/lib/google/errors';

type TestCell = string | number | boolean | null;

function row(input: {
  date: string;
  sleepStart?: string | null;
  sleepEnd?: string | null;
  hourly?: unknown[] | null;
  sleepAvailability?: string;
  activityAvailability?: string;
  sleepModifiedAt?: string | null;
  rhythmModifiedAt?: string | null;
  version?: string;
}): TestCell[] {
  return [
    input.date,
    input.sleepStart === undefined ? `${input.date}T00:10:00-03:00` : input.sleepStart,
    input.sleepEnd === undefined ? `${input.date}T08:10:00-03:00` : input.sleepEnd,
    input.hourly === undefined
      ? JSON.stringify([
          { hour: 8, steps: 100 },
          { hour: 12, steps: 400 },
          { hour: 18, steps: 500 },
        ])
      : input.hourly === null
        ? null
        : JSON.stringify(input.hourly),
    input.sleepAvailability ?? 'available',
    input.activityAvailability ?? 'available',
    input.sleepModifiedAt ?? '2026-09-20T10:00:00Z',
    input.rhythmModifiedAt ?? '2026-09-20T10:00:00Z',
    input.version ?? HEALTH_RHYTHM_FEATURE_VERSION,
  ];
}

function grid(rows: readonly (readonly TestCell[])[]): TestCell[][] {
  return [[...HEALTH_RHYTHM_FEATURES_HEADERS], ...rows.map((value) => [...value])];
}

test('RF1. cinco días válidos alimentan al calculador puro', () => {
  const values = grid(
    ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'].map((date, index) =>
      row({
        date,
        sleepStart: `${date}T00:${String(10 + index * 2).padStart(2, '0')}:00-03:00`,
        sleepEnd: `${date}T08:${String(10 + index * 2).padStart(2, '0')}:00-03:00`,
      }),
    ),
  );
  const snapshot = parseRhythmFeatureValues(values);

  assert.equal(snapshot.state, 'ready');
  assert.equal(snapshot.days.length, 5);
  assert.equal(snapshot.input.sleep.length, 5);
  assert.equal(snapshot.input.activity?.length, 5);
  assert.notEqual(buildRhythmStability(snapshot.input).score, null);
});

test('RF2. missing permanece null y nunca se convierte en cero', () => {
  const snapshot = parseRhythmFeatureValues(
    grid([
      row({
        date: '2026-09-19',
        sleepStart: null,
        sleepEnd: null,
        hourly: null,
        sleepAvailability: 'missing',
        activityAvailability: 'missing',
      }),
    ]),
  );

  assert.equal(snapshot.state, 'ready');
  assert.equal(snapshot.days[0].sleep, null);
  assert.equal(snapshot.days[0].activity, null);
  assert.equal(snapshot.input.sleep.length, 0);
  assert.equal(snapshot.input.activity?.length, 0);
});

test('RF3. preserved conserva feature válida sin presentarla como available', () => {
  const snapshot = parseRhythmFeatureValues(
    grid([
      row({
        date: '2026-09-19',
        sleepAvailability: 'preserved',
        activityAvailability: 'preserved',
      }),
    ]),
  );

  assert.equal(snapshot.state, 'ready');
  assert.equal(snapshot.days[0].sleepAvailability, 'preserved');
  assert.equal(snapshot.days[0].activityAvailability, 'preserved');
  assert.ok(snapshot.days[0].sleep);
  assert.ok(snapshot.days[0].activity);
});

test('RF4. timestamps de sueño sin offset fallan cerrado', () => {
  const snapshot = parseRhythmFeatureValues(
    grid([
      row({
        date: '2026-09-19',
        sleepStart: '2026-09-19T00:10:00',
      }),
    ]),
  );

  assert.equal(snapshot.state, 'error');
  assert.equal(snapshot.days.length, 0);
});

test('RF5. hourly JSON malformado falla cerrado', () => {
  const values = grid([row({ date: '2026-09-19' })]);
  values[1][3] = '{broken';
  const snapshot = parseRhythmFeatureValues(values);

  assert.equal(snapshot.state, 'error');
  assert.equal(snapshot.input.activity?.length, 0);
});

test('RF6. horas duplicadas no se suman silenciosamente', () => {
  const snapshot = parseRhythmFeatureValues(
    grid([
      row({
        date: '2026-09-19',
        hourly: [
          { hour: 9, steps: 100 },
          { hour: 9, steps: 200 },
        ],
      }),
    ]),
  );

  assert.equal(snapshot.state, 'error');
});

test('RF7. fecha duplicada falla cerrado', () => {
  const snapshot = parseRhythmFeatureValues(
    grid([row({ date: '2026-09-19' }), row({ date: '2026-09-19' })]),
  );

  assert.equal(snapshot.state, 'error');
});

test('RF8. versión de features desconocida falla cerrado', () => {
  const snapshot = parseRhythmFeatureValues(
    grid([row({ date: '2026-09-19', version: 'rhythm-features-v2' })]),
  );

  assert.equal(snapshot.state, 'error');
});

test('RF9. schema de columnas distinto falla cerrado', () => {
  const headers: TestCell[] = [...HEALTH_RHYTHM_FEATURES_HEADERS];
  headers[3] = 'Steps';
  const snapshot = parseRhythmFeatureValues([headers, row({ date: '2026-09-19' })]);

  assert.equal(snapshot.state, 'error');
});

test('RF10. source modification metadata inválida falla cerrado', () => {
  const snapshot = parseRhythmFeatureValues(
    grid([
      row({
        date: '2026-09-19',
        sleepModifiedAt: 'not-a-date',
      }),
    ]),
  );

  assert.equal(snapshot.state, 'error');
});

test('RF11. loader lee únicamente la pestaña contractual', async () => {
  const reads: string[] = [];
  const read = async (tab: string): Promise<ReadTabResult> => {
    reads.push(tab);
    return {
      ok: true,
      values: grid([row({ date: '2026-09-19' })]) as (string | number | boolean | null)[][],
    };
  };

  const snapshot = await loadRhythmFeaturesSnapshot(read);

  assert.equal(snapshot.state, 'ready');
  assert.deepEqual(reads, [HEALTH_RHYTHM_FEATURES_TAB]);
});

test('RF12. missing-tab se expone como unavailable sin inventar datos', async () => {
  const snapshot = await loadRhythmFeaturesSnapshot(async () => ({
    ok: false,
    code: 'missing-tab',
  }));

  assert.equal(snapshot.state, 'unavailable');
  assert.equal(snapshot.days.length, 0);
  assert.equal(snapshot.input.sleep.length, 0);
});

test('RF13. una fila completamente vacía no crea un día fantasma', () => {
  const snapshot = parseRhythmFeatureValues([
    [...HEALTH_RHYTHM_FEATURES_HEADERS],
    [null, null, null, null, null, null, null, null, null],
  ]);

  assert.equal(snapshot.state, 'empty');
  assert.equal(snapshot.days.length, 0);
});


test('RF14. view model ready expone Rhythm calculable sin datos raw', () => {
  const snapshot = parseRhythmFeatureValues(
    grid(
      ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'].map(
        (date, index) =>
          row({
            date,
            sleepStart: `${date}T00:${String(10 + index * 2).padStart(2, '0')}:00-03:00`,
            sleepEnd: `${date}T08:${String(10 + index * 2).padStart(2, '0')}:00-03:00`,
          }),
      ),
    ),
  );

  const view = buildRhythmFeaturesViewModel(snapshot);

  assert.equal(view.state, 'ready');
  assert.notEqual(view.result?.score, null);
  assert.equal(view.notice, null);
});

test('RF15. view model ready con evidencia corta queda insufficient sin score inventado', () => {
  const snapshot = parseRhythmFeatureValues(
    grid(
      ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'].map((date) => row({ date })),
    ),
  );

  const view = buildRhythmFeaturesViewModel(snapshot);

  assert.equal(snapshot.state, 'ready');
  assert.equal(view.state, 'insufficient');
  assert.equal(view.result?.score, null);
});

test('RF16. view model conserva empty de forma explícita', () => {
  const snapshot = parseRhythmFeatureValues([[...HEALTH_RHYTHM_FEATURES_HEADERS]]);
  const view = buildRhythmFeaturesViewModel(snapshot);

  assert.equal(view.state, 'empty');
  assert.equal(view.result, null);
  assert.match(view.notice ?? '', /todavía no tiene días normalizados/i);
});

test('RF17. view model conserva unavailable y su mensaje sanitizado', async () => {
  const snapshot = await loadRhythmFeaturesSnapshot(async () => ({
    ok: false,
    code: 'missing-tab',
  }));
  const view = buildRhythmFeaturesViewModel(snapshot);

  assert.equal(view.state, 'unavailable');
  assert.equal(view.result, null);
  assert.match(view.notice ?? '', /Health Rhythm Features/i);
});

test('RF18. view model conserva error sin intentar calcular', () => {
  const headers: TestCell[] = [...HEALTH_RHYTHM_FEATURES_HEADERS];
  headers[0] = 'Wrong';
  const snapshot = parseRhythmFeatureValues([headers]);
  const view = buildRhythmFeaturesViewModel(snapshot);

  assert.equal(view.state, 'error');
  assert.equal(view.result, null);
});

test('RF19. missing sigue missing en la proyección y no se convierte en cero', () => {
  const snapshot = parseRhythmFeatureValues(
    grid([
      row({
        date: '2026-09-19',
        sleepStart: null,
        sleepEnd: null,
        hourly: null,
        sleepAvailability: 'missing',
        activityAvailability: 'missing',
      }),
    ]),
  );
  const view = buildRhythmFeaturesViewModel(snapshot);

  assert.equal(view.state, 'insufficient');
  assert.equal(view.result?.score, null);
  assert.equal(view.result?.validSleepNights, 0);
  assert.equal(view.result?.validActivityDays, 0);
});
