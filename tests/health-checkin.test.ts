import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildHealthCheckinRow,
  HEALTH_CHECKIN_HEADERS,
  HEALTH_CHECKIN_VERSION,
  inspectHealthCheckinTable,
  todayInCordoba,
  upsertHealthCheckinWithPort,
  validateHealthCheckinInput,
  type HealthCheckinCell,
  type HealthCheckinSheetPort,
} from '@/lib/health/checkin';

const DATE = '2030-04-05';
const NOW = new Date('2030-04-05T18:30:00.000Z');
const DEV_TARGET = { target: 'dev' as const, writesAllowed: true };
const BASE = {
  energy: 3,
  rested: 4,
  soreness: 2,
  stress: null,
  focus: null,
  workoutRpe: null,
  unwell: null,
  note: null,
};

function gridWithRow(values = BASE): HealthCheckinCell[][] {
  return [
    [...HEALTH_CHECKIN_HEADERS],
    [...buildHealthCheckinRow(DATE, values, '2030-04-05T17:00:00.000Z')],
  ];
}

function memoryPort(initial: HealthCheckinCell[][]): HealthCheckinSheetPort & {
  writes: { rowNumber: number; row: readonly HealthCheckinCell[] }[];
  grid: HealthCheckinCell[][];
} {
  const grid = initial.map((row) => [...row]);
  const writes: { rowNumber: number; row: readonly HealthCheckinCell[] }[] = [];
  return {
    grid,
    writes,
    async read() {
      return { ok: true, values: grid.map((row) => [...row]) };
    },
    async writeRow(rowNumber, row) {
      while (grid.length < rowNumber) grid.push([]);
      grid[rowNumber - 1] = [...row];
      writes.push({ rowNumber, row: [...row] });
      return { ok: true };
    },
  };
}

test('HC1. el schema canónico tiene exactamente 11 columnas en el orden del contrato', () => {
  assert.deepEqual(HEALTH_CHECKIN_HEADERS, [
    'Date',
    'Energy',
    'Rested',
    'Soreness',
    'Stress',
    'Focus',
    'Workout RPE',
    'Unwell',
    'Note',
    'Updated At',
    'Check-in Version',
  ]);
  assert.equal(HEALTH_CHECKIN_VERSION, 'health-checkin-v1');
});

test('HC2. valida rangos estrictos y rechaza cero, decimales y RPE > 10', () => {
  for (const input of [
    { ...BASE, energy: 0 },
    { ...BASE, rested: 6 },
    { ...BASE, soreness: 1.5 },
    { ...BASE, stress: 0 },
    { ...BASE, focus: 6 },
    { ...BASE, workoutRpe: 11 },
  ]) {
    assert.equal(validateHealthCheckinInput(input).ok, false);
  }
  assert.equal(validateHealthCheckinInput({ ...BASE, workoutRpe: 10 }).ok, true);
});

test('HC3. missing permanece vacío y nunca se serializa como cero', () => {
  const valid = validateHealthCheckinInput(BASE);
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  const row = buildHealthCheckinRow(DATE, valid.values, NOW.toISOString());
  assert.deepEqual(row.slice(4, 9), ['', '', '', '', '']);
  assert.equal(row.slice(4, 9).includes(0), false);
});

test('HC4. un retry idéntico del mismo día es idempotente y no vuelve a escribir', async () => {
  const port = memoryPort(gridWithRow());
  const result = await upsertHealthCheckinWithPort(BASE, port, {
    targetDate: DATE,
    now: NOW,
    target: DEV_TARGET,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.replay, true);
  assert.equal(port.writes.length, 0);
  assert.equal(port.grid.length, 2);
});

test('HC5. una corrección del mismo día reemplaza la misma fila', async () => {
  const port = memoryPort(gridWithRow());
  const corrected = { ...BASE, energy: 5, note: 'synthetic-note' };
  const result = await upsertHealthCheckinWithPort(corrected, port, {
    targetDate: DATE,
    now: NOW,
    target: DEV_TARGET,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.replay, false);
  assert.equal(port.writes.length, 1);
  assert.equal(port.writes[0].rowNumber, 2);
  assert.equal(port.grid.length, 2);
  const inspected = inspectHealthCheckinTable(port.grid);
  assert.equal(inspected.ok, true);
  if (!inspected.ok) return;
  assert.equal(inspected.records.length, 1);
  assert.equal(inspected.records[0].values.energy, 5);
  assert.equal(inspected.records[0].values.note, 'synthetic-note');
});

test('HC6. una fecha nueva usa una sola fila lógica sin append', async () => {
  const port = memoryPort([[...HEALTH_CHECKIN_HEADERS]]);
  const result = await upsertHealthCheckinWithPort(BASE, port, {
    targetDate: DATE,
    now: NOW,
    target: DEV_TARGET,
  });
  assert.equal(result.ok, true);
  assert.equal(port.writes.length, 1);
  assert.equal(port.writes[0].rowNumber, 2);
  const inspected = inspectHealthCheckinTable(port.grid);
  assert.equal(inspected.ok, true);
  if (!inspected.ok) return;
  assert.equal(inspected.records.length, 1);
});

test('HC7. duplicados preexistentes fallan cerrado y no escriben', async () => {
  const row = [...buildHealthCheckinRow(DATE, BASE, '2030-04-05T17:00:00.000Z')];
  const port = memoryPort([[...HEALTH_CHECKIN_HEADERS], row, [...row]]);
  const result = await upsertHealthCheckinWithPort(BASE, port, {
    targetDate: DATE,
    now: NOW,
    target: DEV_TARGET,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'duplicate-date');
  assert.equal(port.writes.length, 0);
});

test('HC8. fallo de lectura/source falla cerrado sin intentar escribir', async () => {
  let writes = 0;
  const port: HealthCheckinSheetPort = {
    async read() {
      return { ok: false, code: 'permission-error' };
    },
    async writeRow() {
      writes += 1;
      return { ok: true };
    },
  };
  const result = await upsertHealthCheckinWithPort(BASE, port, {
    targetDate: DATE,
    now: NOW,
    target: DEV_TARGET,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'permission-error');
  assert.equal(writes, 0);
});

test('HC9. target Production queda bloqueado incluso si writesAllowed=true', async () => {
  let reads = 0;
  let writes = 0;
  const port: HealthCheckinSheetPort = {
    async read() {
      reads += 1;
      return { ok: true, values: [[...HEALTH_CHECKIN_HEADERS]] };
    },
    async writeRow() {
      writes += 1;
      return { ok: true };
    },
  };
  const result = await upsertHealthCheckinWithPort(BASE, port, {
    targetDate: DATE,
    now: NOW,
    target: { target: 'prod', writesAllowed: true },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'production-disabled');
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test('HC10. Córdoba define la fecha local sin depender del día UTC', () => {
  assert.equal(todayInCordoba(new Date('2030-04-06T01:30:00.000Z')), '2030-04-05');
});

test('HC11. Action exige sesión y el puerto usa values.update acotado por PUT', () => {
  const action = readFileSync(join(process.cwd(), 'app/actions/health-checkin.ts'), 'utf8');
  const port = readFileSync(join(process.cwd(), 'lib/health/checkin-google-port.ts'), 'utf8');
  const ui = readFileSync(join(process.cwd(), 'components/health/HealthCheckinForm.tsx'), 'utf8');

  assert.match(action, /verifySession/);
  assert.doesNotMatch(action, /spreadsheetId/);
  assert.match(port, /config\.config\.target !== 'dev'/);
  assert.match(port, /method: 'PUT'/);
  assert.match(port, /valueInputOption=RAW/);
  assert.doesNotMatch(port, /append|insertDimension|deleteDimension|batchClear/i);
  assert.doesNotMatch(ui, /useEffect|streak|racha/i);
  assert.match(ui, /type="submit"/);
});
