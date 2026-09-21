import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  HEALTH_CHECKIN_HEADERS,
  HEALTH_CHECKIN_TAB,
  HEALTH_CHECKIN_VERSION,
  healthCheckinToRow,
  parseHealthCheckinRow,
  type HealthCheckin,
  type HealthCheckinCell,
  type HealthCheckinSheetPort,
  upsertHealthCheckinWithPort,
} from '@/lib/health/checkin';
import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';

const TODAY = '2026-09-20';
const DEV_ID = 'synthetic-dev-spreadsheet-aaaaaaaa';
const PROD_ID = 'synthetic-prod-spreadsheet-bbbbbbbb';

function resolvedDev() {
  const result = resolveSpreadsheetTarget({
    GOOGLE_SHEETS_TARGET: 'dev',
    GOOGLE_SHEETS_DEV_ID: DEV_ID,
    GOOGLE_SHEETS_PROD_ID: PROD_ID,
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    VERCEL_ENV: 'preview',
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('synthetic DEV target did not resolve');
  return result;
}

function syntheticCheckin(overrides: Partial<HealthCheckin> = {}): HealthCheckin {
  return {
    date: TODAY,
    energy: 3,
    rested: 4,
    soreness: 2,
    stress: null,
    focus: null,
    workoutRpe: null,
    unwell: null,
    note: null,
    updatedAt: '2026-09-20T15:00:00.000Z',
    version: HEALTH_CHECKIN_VERSION,
    ...overrides,
  };
}

function createMemoryPort(initial: HealthCheckinCell[][]): HealthCheckinSheetPort & {
  writes: { range: string; values: HealthCheckinCell[] }[];
  grid: HealthCheckinCell[][];
} {
  const grid = initial.map((row) => [...row]);
  const writes: { range: string; values: HealthCheckinCell[] }[] = [];

  return {
    grid,
    writes,
    async readAll() {
      return { ok: true, values: grid.map((row) => [...row]) };
    },
    async writeRow(rangeA1, values) {
      const match = /^'Health Check-ins'!A(\d+):K\1$/.exec(rangeA1);
      assert.ok(match);
      const rowIndex = Number(match[1]) - 1;
      while (grid.length <= rowIndex) grid.push([]);
      grid[rowIndex] = [...values];
      writes.push({ range: rangeA1, values: [...values] });
      return { ok: true };
    },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    targetDate: TODAY,
    energy: 3,
    rested: 4,
    soreness: 2,
    stress: null,
    focus: null,
    workoutRpe: null,
    unwell: null,
    note: null,
    operationId: 'synthetic-op',
    ...overrides,
  } as Parameters<typeof upsertHealthCheckinWithPort>[0];
}

test('HC1. el contrato DEV tiene exactamente las 11 columnas canónicas', () => {
  assert.equal(HEALTH_CHECKIN_TAB, 'Health Check-ins');
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
});

test('HC2. valida rangos estrictos y rechaza cero', async () => {
  for (const invalid of [
    { energy: 0 },
    { rested: 6 },
    { soreness: 0 },
    { stress: 0 },
    { focus: 6 },
    { workoutRpe: 11 },
  ]) {
    const port = createMemoryPort([[...HEALTH_CHECKIN_HEADERS]]);
    const result = await upsertHealthCheckinWithPort(input(invalid), port, {
      today: TODAY,
      resolved: resolvedDev(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'invalid-value');
    assert.equal(port.writes.length, 0);
  }
});

test('HC3. missing permanece blank/null y nunca se convierte en cero', () => {
  const checkin = syntheticCheckin();
  const row = healthCheckinToRow(checkin);
  assert.equal(row[4], '');
  assert.equal(row[5], '');
  assert.equal(row[6], '');
  assert.equal(row[7], '');
  assert.equal(row[8], '');

  const parsed = parseHealthCheckinRow(row);
  assert.ok(parsed);
  assert.equal(parsed.stress, null);
  assert.equal(parsed.focus, null);
  assert.equal(parsed.workoutRpe, null);
  assert.equal(parsed.unwell, null);
  assert.equal(parsed.note, null);
});

test('HC4. same-day retry idéntico es idempotente y no vuelve a escribir', async () => {
  const existing = syntheticCheckin();
  const port = createMemoryPort([
    [...HEALTH_CHECKIN_HEADERS],
    healthCheckinToRow(existing),
  ]);

  const result = await upsertHealthCheckinWithPort(input(), port, {
    today: TODAY,
    now: new Date('2026-09-20T18:00:00.000Z'),
    resolved: resolvedDev(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.replay, true);
  assert.equal(result.corrected, false);
  assert.equal(port.writes.length, 0);
  assert.equal(result.checkin.updatedAt, existing.updatedAt);
});

test('HC5. una corrección del mismo día reemplaza la misma fila', async () => {
  const port = createMemoryPort([
    [...HEALTH_CHECKIN_HEADERS],
    healthCheckinToRow(syntheticCheckin()),
  ]);

  const result = await upsertHealthCheckinWithPort(input({ energy: 5, focus: 4 }), port, {
    today: TODAY,
    now: new Date('2026-09-20T18:00:00.000Z'),
    resolved: resolvedDev(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.corrected, true);
  assert.equal(result.rowNumber, 2);
  assert.equal(result.checkin.energy, 5);
  assert.equal(result.checkin.focus, 4);
  assert.equal(port.writes.length, 1);
  assert.equal(port.writes[0].range, "'Health Check-ins'!A2:K2");
  assert.equal(port.grid.length, 2);
});

test('HC6. una fecha duplicada falla cerrado sin escribir', async () => {
  const row = healthCheckinToRow(syntheticCheckin());
  const port = createMemoryPort([[...HEALTH_CHECKIN_HEADERS], row, [...row]]);

  const result = await upsertHealthCheckinWithPort(input({ energy: 5 }), port, {
    today: TODAY,
    resolved: resolvedDev(),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'duplicate-date');
  assert.equal(port.writes.length, 0);
});

test('HC7. read/source failure falla cerrado sin escribir', async () => {
  let writes = 0;
  const port: HealthCheckinSheetPort = {
    async readAll() {
      return { ok: false, code: 'read-error' };
    },
    async writeRow() {
      writes += 1;
      return { ok: true };
    },
  };

  const result = await upsertHealthCheckinWithPort(input(), port, {
    today: TODAY,
    resolved: resolvedDev(),
  });

  assert.equal(result.ok, false);
  assert.equal(writes, 0);
});

test('HC8. schema incorrecto falla cerrado sin escribir', async () => {
  const port = createMemoryPort([['Date', 'Energy']]);
  const result = await upsertHealthCheckinWithPort(input(), port, {
    today: TODAY,
    resolved: resolvedDev(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'invalid-schema');
  assert.equal(port.writes.length, 0);
});

test('HC9. Production queda hard-blocked incluso si el flag general permite writes', async () => {
  const prod = resolveSpreadsheetTarget({
    GOOGLE_SHEETS_TARGET: 'prod',
    GOOGLE_SHEETS_DEV_ID: DEV_ID,
    GOOGLE_SHEETS_PROD_ID: PROD_ID,
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'true',
    VERCEL_ENV: 'production',
  });
  assert.equal(prod.ok, true);
  if (!prod.ok) return;

  const port = createMemoryPort([[...HEALTH_CHECKIN_HEADERS]]);
  const result = await upsertHealthCheckinWithPort(input(), port, {
    today: TODAY,
    resolved: prod,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'unauthorized-spreadsheet');
  assert.equal(port.writes.length, 0);
});

test('HC10. Action exige sesión y el puerto no usa append ni operaciones estructurales', () => {
  const action = readFileSync(join(process.cwd(), 'app/actions/health-checkin.ts'), 'utf8');
  const port = readFileSync(join(process.cwd(), 'lib/health/checkin-sheet.ts'), 'utf8');
  const component = readFileSync(
    join(process.cwd(), 'components/health/HealthCheckinCard.tsx'),
    'utf8',
  );

  assert.match(action, /verifySession/);
  assert.match(action, /upsertHealthCheckinWithPort/);
  assert.doesNotMatch(
    port,
    /values:append|batchUpdate|insertDimension|deleteDimension|batchClear/i,
  );
  assert.match(port, /method: 'PUT'/);
  assert.doesNotMatch(component, /streak|racha/i);
  assert.doesNotMatch(component, /autoSubmit|onBlur=.*save|onFocus=.*save/i);
});
