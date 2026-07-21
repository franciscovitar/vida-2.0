import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { RD } from '@/lib/google/constants';
import { compareManualHabits } from '@/lib/habits/migration-compare';

function grid(rows: unknown[][]): unknown[][] {
  return rows;
}

const HEADER = [
  RD.fecha,
  RD.firstAlarm,
  RD.bed,
  RD.shower,
  RD.posture,
  RD.gym,
  RD.cardio,
  RD.stretch,
  RD.mealPrep,
  RD.journaling,
  RD.football,
];

test('1. true DEV + false prod → candidata', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.firstAlarm],
    devValues: grid([
      HEADER,
      ['2026-07-15', true, false, false, false, false, false, false, false, false, false],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.candidates, 1);
  assert.equal(result.candidates[0]?.habitName, RD.firstAlarm);
  assert.equal(result.candidates[0]?.expectedValue, true);
  assert.match(result.candidates[0]?.a1 ?? '', /Registro diario![A-Z]+\d+/);
});

test('2. true DEV + true prod → noop', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.firstAlarm],
    devValues: grid([
      HEADER,
      ['2026-07-15', true, false, false, false, false, false, false, false, false, false],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', true, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.equalTrue, 1);
  assert.equal(result.totals.candidates, 0);
});

test('3. false DEV + true prod → conservar prod', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.firstAlarm],
    devValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', true, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.preserveProdTrue, 1);
  assert.equal(result.totals.candidates, 0);
});

test('4–5. false DEV + false prod → noop; false nunca se copia', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.firstAlarm],
    devValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.bothFalseOrEmpty, 1);
  assert.equal(result.totals.candidates, 0);
  assert.equal(result.proposesCopyingFalse, false);
  assert.ok(result.candidates.every((c) => c.expectedValue === true));
});

test('6. fecha futura excluida', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.gym],
    devValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
      ['2026-08-01', false, false, false, false, true, false, false, false, false, false],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
      ['2026-08-01', false, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.candidates, 0);
  assert.ok(result.dateRange && result.dateRange.max <= '2026-07-20');
});

test('7. fecha inválida excluida', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.journaling],
    devValues: grid([
      HEADER,
      ['no-fecha', false, false, false, false, false, false, false, false, true, false],
      ['2026-07-15', false, false, false, false, false, false, false, false, true, false],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.candidates, 1);
  assert.equal(result.candidates[0]?.date, '2026-07-15');
});

test('8. columna fuera de whitelist excluida', () => {
  const headerWithExtra = [...HEADER, 'Pasos'];
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.firstAlarm],
    devValues: grid([
      headerWithExtra,
      ['2026-07-15', true, false, false, false, false, false, false, false, false, false, 999],
    ]),
    prodValues: grid([
      headerWithExtra,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false, 0],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.cellsCompared, 1);
  assert.equal(result.candidates[0]?.habitName, RD.firstAlarm);
});

test('9. valores no booleanos → anomalía', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.bed],
    devValues: grid([
      HEADER,
      ['2026-07-15', false, '???', false, false, false, false, false, false, false, false],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.totals.anomalies >= 1);
  assert.equal(result.totals.candidates, 0);
  assert.doesNotMatch(JSON.stringify(result.anomalies), /\?\?\?/);
});

test('10. duplicados fecha+hábito eliminados en candidatas', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.posture],
    devValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, true, false, false, false, false, false, false],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.candidates, result.candidates.length);
  const keys = result.candidates.map((c) => `${c.date}:${c.habitName}`);
  assert.equal(keys.length, new Set(keys).size);
});

test('11–13. una celda A1; sin filas/rangos/columnas automáticas', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.football],
    devValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, true],
    ]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.candidates.length, 1);
  assert.match(result.candidates[0]!.a1, /^Registro diario![A-Z]+\d+$/);
  assert.doesNotMatch(result.candidates[0]!.a1, /:/);
  assert.doesNotMatch(JSON.stringify(result), /Pasos|Sueño|ActivityWatch|Huawei/i);
});

test('14. dry-run module no invoca PUT/POST/PATCH/DELETE', () => {
  const src = readFileSync(join(process.cwd(), 'lib/habits/migration-compare.ts'), 'utf8');
  assert.doesNotMatch(src, /\bfetch\b|\bPUT\b|\bPOST\b|\bPATCH\b|\bDELETE\b/);
  assert.doesNotMatch(src, /sheets\.googleapis|spreadsheets\//);
});

test('15. IDs no aparecen en errores del comparador', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.gym],
    devValues: grid([['Fecha'], ['2026-07-15']]),
    prodValues: grid([
      HEADER,
      ['2026-07-15', false, false, false, false, false, false, false, false, false, false],
    ]),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.doesNotMatch(JSON.stringify(result), /1[A-Za-z0-9_-]{20,}/);
});

test('16. Notion y Calendar intactos (módulo de migración no los importa)', () => {
  const src = readFileSync(join(process.cwd(), 'lib/habits/migration-compare.ts'), 'utf8');
  assert.doesNotMatch(src, /notion|calendar/i);
});
