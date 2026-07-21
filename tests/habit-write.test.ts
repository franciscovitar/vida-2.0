import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RD, REGISTRO_DIARIO_HEADERS, REGISTRO_DIARIO_TAB } from '@/lib/google/constants';
import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';
import { HabitOptimisticController } from '@/lib/habits/optimistic';
import {
  columnIndexToA1,
  findHabitColumn,
  findRowsForDate,
  habitCellRange,
} from '@/lib/habits/sheet-locate';
import type { HabitSheetPort } from '@/lib/habits/sheet-port';
import { toggleHabitWithPort } from '@/lib/habits/toggle';
import type { ToggleHabitResult } from '@/lib/habits/types';

const TODAY = '2026-07-20';
const DEV_ID = 'test-dev-spreadsheet-id-aaaaaaaaaaaa';
const PROD_ID = 'test-prod-spreadsheet-id-bbbbbbbbbbbb';

const DEV_RESOLVED = (() => {
  const r = resolveSpreadsheetTarget({
    GOOGLE_SHEETS_TARGET: 'dev',
    GOOGLE_SHEETS_DEV_ID: DEV_ID,
    GOOGLE_SHEETS_PROD_ID: PROD_ID,
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
  });
  assert.equal(r.ok, true);
  if (!r.ok) throw new Error('dev resolve');
  return r;
})();

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

function baseGrid(overrides?: {
  todayRow?: Record<string, unknown>;
  extraRows?: unknown[][];
}): unknown[][] {
  const today = rowFor(REGISTRO_DIARIO_HEADERS, {
    [RD.fecha]: TODAY,
    [RD.sleep]: 7.5,
    [RD.energy]: 4,
    [RD.work]: 60,
    [RD.firstAlarm]: false,
    [RD.bed]: true,
    [RD.gym]: false,
    [RD.journaling]: false,
    ...(overrides?.todayRow ?? {}),
  });
  return [[...REGISTRO_DIARIO_HEADERS], today, ...(overrides?.extraRows ?? [])];
}

/** Puerto en memoria: clona la grilla y solo permite PUT de una celda. */
function createMemoryPort(initial: unknown[][]): HabitSheetPort & {
  writes: { range: string; value: boolean }[];
  snapshot: () => unknown[][];
} {
  const grid: unknown[][] = initial.map((row) => [...row]);
  const writes: { range: string; value: boolean }[] = [];

  function parseRange(rangeA1: string): { col: number; row: number } {
    assert.match(rangeA1, new RegExp(`^${REGISTRO_DIARIO_TAB}![A-Z]+\\d+$`));
    const cell = rangeA1.split('!')[1];
    const match = /^([A-Z]+)(\d+)$/.exec(cell);
    assert.ok(match);
    const letters = match[1];
    let col = 0;
    for (const ch of letters) {
      col = col * 26 + (ch.charCodeAt(0) - 64);
    }
    return { col: col - 1, row: Number.parseInt(match[2], 10) - 1 };
  }

  return {
    writes,
    snapshot: () => grid.map((row) => [...row]),
    async readRegistroDiario() {
      return { ok: true, values: grid.map((row) => [...row]) };
    },
    async readCell(rangeA1) {
      const { col, row } = parseRange(rangeA1);
      return { ok: true, value: grid[row]?.[col] ?? null };
    },
    async writeCell(rangeA1, value) {
      const { col, row } = parseRange(rangeA1);
      assert.ok(grid[row], 'fila inexistente');
      grid[row][col] = value;
      writes.push({ range: rangeA1, value });
      return { ok: true };
    },
  };
}

function input(partial: {
  habitName?: string;
  nextValue?: boolean;
  expectedPreviousValue?: boolean;
  targetDate?: string;
  operationId?: string;
}) {
  return {
    targetDate: partial.targetDate ?? TODAY,
    habitName: partial.habitName ?? RD.firstAlarm,
    nextValue: partial.nextValue ?? true,
    expectedPreviousValue: partial.expectedPreviousValue ?? false,
    operationId: partial.operationId ?? 'op-1',
  };
}

function isPlainSerializable(value: unknown): boolean {
  try {
    const roundTrip = JSON.parse(JSON.stringify(value));
    return JSON.stringify(roundTrip) === JSON.stringify(value);
  } catch {
    return false;
  }
}

function assertNoSecrets(result: ToggleHabitResult) {
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /private_key|BEGIN PRIVATE|gaxios|ArrayBuffer|credentials/i);
  assert.doesNotMatch(json, new RegExp(DEV_ID));
  assert.equal(isPlainSerializable(result), true);
  assert.equal(typeof result, 'object');
  assert.ok(result !== null);
  assert.equal('ok' in result, true);
}

test('1. escritura permitida en un hábito autorizado', async () => {
  const port = createMemoryPort(baseGrid());
  const before = port.snapshot();
  const result = await toggleHabitWithPort(input({}), port, {
    today: TODAY,
    resolved: DEV_RESOLVED,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.habitName, RD.firstAlarm);
  assert.equal(result.previousValue, false);
  assert.equal(result.currentValue, true);
  assert.equal(result.rowNumber, 2);
  assert.equal(port.writes.length, 1);
  assert.equal(port.writes[0].value, true);

  const col = findHabitColumn(before[0], RD.firstAlarm)!;
  const after = port.snapshot();
  assert.equal(after[1][col - 1], true);
  assertNoSecrets(result);
});

test('2. columna no autorizada rechazada', async () => {
  const port = createMemoryPort(baseGrid());
  const result = await toggleHabitWithPort(
    input({ habitName: 'Sueño (h)', nextValue: true, expectedPreviousValue: false }),
    port,
    { today: TODAY, resolved: DEV_RESOLVED },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'unauthorized-column');
  assert.equal(port.writes.length, 0);
  assertNoSecrets(result);
});

test('3. spreadsheet de producción sin allow rechazado', async () => {
  const port = createMemoryPort(baseGrid());
  const prod = resolveSpreadsheetTarget({
    GOOGLE_SHEETS_TARGET: 'prod',
    GOOGLE_SHEETS_DEV_ID: DEV_ID,
    GOOGLE_SHEETS_PROD_ID: PROD_ID,
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    VERCEL_ENV: 'production',
  });
  assert.equal(prod.ok, true);
  if (!prod.ok) return;
  const result = await toggleHabitWithPort(input({}), port, {
    today: TODAY,
    resolved: prod,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'unauthorized-spreadsheet');
  assert.equal(port.writes.length, 0);
  assertNoSecrets(result);
});

test('4. fecha sin fila rechazada', async () => {
  const port = createMemoryPort([[...REGISTRO_DIARIO_HEADERS]]);
  const result = await toggleHabitWithPort(input({}), port, {
    today: TODAY,
    resolved: DEV_RESOLVED,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'row-not-found');
  assert.equal(port.writes.length, 0);
});

test('5. fecha duplicada rechazada', async () => {
  const port = createMemoryPort(
    baseGrid({
      extraRows: [
        rowFor(REGISTRO_DIARIO_HEADERS, {
          [RD.fecha]: TODAY,
          [RD.firstAlarm]: false,
        }),
      ],
    }),
  );
  const result = await toggleHabitWithPort(input({}), port, {
    today: TODAY,
    resolved: DEV_RESOLVED,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'duplicate-date');
  assert.equal(port.writes.length, 0);
});

test('6. expectedPreviousValue incorrecto produce conflicto sin escribir', async () => {
  const port = createMemoryPort(baseGrid({ todayRow: { [RD.firstAlarm]: true } }));
  const snapshot = port.snapshot();
  const result = await toggleHabitWithPort(
    input({ nextValue: false, expectedPreviousValue: false }),
    port,
    { today: TODAY, resolved: DEV_RESOLVED },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'conflict');
  assert.equal(port.writes.length, 0);
  assert.deepEqual(port.snapshot(), snapshot);
});

test('7 y 8. cero/vacíos de otras columnas intactos y solo una celda cambia', async () => {
  const port = createMemoryPort(
    baseGrid({
      todayRow: {
        [RD.leisure]: 0,
        [RD.faculty]: '',
        [RD.bed]: true,
        [RD.firstAlarm]: false,
      },
    }),
  );
  const before = port.snapshot();
  const result = await toggleHabitWithPort(input({}), port, {
    today: TODAY,
    resolved: DEV_RESOLVED,
  });
  assert.equal(result.ok, true);
  assert.equal(port.writes.length, 1);

  const after = port.snapshot();
  const alarmCol = findHabitColumn(before[0], RD.firstAlarm)! - 1;
  for (let c = 0; c < before[0].length; c += 1) {
    if (c === alarmCol) {
      assert.equal(after[1][c], true);
    } else {
      assert.equal(after[1][c], before[1][c], `columna ${String(before[0][c])} no debía cambiar`);
    }
  }
});

test('9. segundo toque sobre el mismo hábito queda bloqueado', () => {
  const controller = new HabitOptimisticController([
    { id: RD.firstAlarm, value: false, save: 'idle', canUndo: false },
    { id: RD.gym, value: false, save: 'idle', canUndo: false },
  ]);
  const first = controller.beginToggle(RD.firstAlarm, true);
  assert.equal(first.ok, true);
  const second = controller.beginToggle(RD.firstAlarm, false);
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.reason, 'locked');
});

test('10. otros hábitos siguen utilizables mientras uno está pendiente', () => {
  const controller = new HabitOptimisticController([
    { id: RD.firstAlarm, value: false, save: 'idle', canUndo: false },
    { id: RD.gym, value: false, save: 'idle', canUndo: false },
  ]);
  assert.equal(controller.beginToggle(RD.firstAlarm, true).ok, true);
  assert.equal(controller.othersRemainInteractive(RD.firstAlarm), true);
  assert.equal(controller.beginToggle(RD.gym, true).ok, true);
  assert.equal(controller.items.find((h) => h.id === RD.gym)?.save, 'saving');
});

test('11. error restaura el estado visual', () => {
  const controller = new HabitOptimisticController([
    { id: RD.firstAlarm, value: false, save: 'idle', canUndo: false },
  ]);
  const begin = controller.beginToggle(RD.firstAlarm, true);
  assert.equal(begin.ok, true);
  controller.fail(RD.firstAlarm, begin.ok ? begin.previous : false, false);
  const item = controller.items[0];
  assert.equal(item.value, false);
  assert.equal(item.save, 'error');
  assert.equal(item.canUndo, false);
});

test('12. deshacer funciona', async () => {
  const port = createMemoryPort(baseGrid({ todayRow: { [RD.firstAlarm]: false } }));
  const controller = new HabitOptimisticController([
    { id: RD.firstAlarm, value: false, save: 'idle', canUndo: false },
  ]);

  const begin = controller.beginToggle(RD.firstAlarm, true);
  assert.equal(begin.ok, true);
  if (!begin.ok) return;

  const write = await toggleHabitWithPort(
    input({
      nextValue: begin.nextValue,
      expectedPreviousValue: begin.previous,
      operationId: 'op-write',
    }),
    port,
    { today: TODAY, resolved: DEV_RESOLVED },
  );
  assert.equal(write.ok, true);
  if (!write.ok) return;
  controller.succeed(RD.firstAlarm, write.currentValue, true);

  const undoBegin = controller.beginUndo(RD.firstAlarm);
  assert.equal(undoBegin.ok, true);
  if (!undoBegin.ok) return;
  assert.equal(undoBegin.previous, true);
  assert.equal(undoBegin.nextValue, false);

  const undo = await toggleHabitWithPort(
    input({
      nextValue: undoBegin.nextValue,
      expectedPreviousValue: undoBegin.previous,
      operationId: 'op-undo',
    }),
    port,
    { today: TODAY, resolved: DEV_RESOLVED },
  );
  assert.equal(undo.ok, true);
  if (!undo.ok) return;
  assert.equal(undo.currentValue, false);
  controller.succeed(RD.firstAlarm, undo.currentValue, false);
  assert.equal(controller.items[0].value, false);
});

test('13. deshacer con conflicto falla de forma segura', async () => {
  const port = createMemoryPort(baseGrid({ todayRow: { [RD.firstAlarm]: true } }));
  const controller = new HabitOptimisticController([
    { id: RD.firstAlarm, value: true, save: 'saved', canUndo: true },
  ]);

  const col = findHabitColumn(port.snapshot()[0], RD.firstAlarm)!;
  const range = habitCellRange(2, col);
  await port.writeCell(range, false);
  port.writes.length = 0;

  const undoBegin = controller.beginUndo(RD.firstAlarm);
  assert.equal(undoBegin.ok, true);
  if (!undoBegin.ok) return;

  const undo = await toggleHabitWithPort(
    input({
      nextValue: undoBegin.nextValue,
      expectedPreviousValue: undoBegin.previous,
      operationId: 'op-undo-conflict',
    }),
    port,
    { today: TODAY, resolved: DEV_RESOLVED },
  );
  assert.equal(undo.ok, false);
  if (undo.ok) return;
  assert.equal(undo.code, 'conflict');
  assert.equal(port.writes.length, 0);
  controller.fail(RD.firstAlarm, undoBegin.previous, true);
  assert.equal(controller.items[0].value, true);
  assert.equal(controller.items[0].save, 'conflict');
});

test('14. no existen operaciones append, insert, delete o clear en el puerto real', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const writePort = readFileSync(join(process.cwd(), 'lib', 'habits', 'google-port.ts'), 'utf8');
  assert.doesNotMatch(writePort, /append|batchUpdate|clear|insert|delete/i);
  assert.match(writePort, /method: 'PUT'/);
  assert.match(writePort, /writesAllowed/);
});

test('15. todas las respuestas son objetos planos serializables', async () => {
  const cases: ToggleHabitResult[] = [];
  const port = createMemoryPort(baseGrid());

  cases.push(
    await toggleHabitWithPort(input({}), port, {
      today: TODAY,
      resolved: DEV_RESOLVED,
    }),
  );
  cases.push(
    await toggleHabitWithPort(input({ habitName: 'No existe' }), port, {
      today: TODAY,
      resolved: DEV_RESOLVED,
    }),
  );
  const prodBlocked = resolveSpreadsheetTarget({
    GOOGLE_SHEETS_TARGET: 'prod',
    GOOGLE_SHEETS_DEV_ID: DEV_ID,
    GOOGLE_SHEETS_PROD_ID: PROD_ID,
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    VERCEL_ENV: 'production',
  });
  assert.ok(prodBlocked.ok);
  if (!prodBlocked.ok) return;
  cases.push(await toggleHabitWithPort(input({}), port, { today: TODAY, resolved: prodBlocked }));

  for (const result of cases) {
    assertNoSecrets(result);
    const keys = Object.keys(result);
    assert.ok(keys.every((key) => typeof key === 'string'));
  }
});

test('utilidades A1: Primera alarma apunta a la celda esperada', () => {
  const grid = baseGrid();
  const col = findHabitColumn(grid[0], RD.firstAlarm);
  assert.ok(col !== null);
  const rows = findRowsForDate(grid, TODAY);
  assert.equal(rows.kind, 'ok');
  if (rows.kind !== 'ok') return;
  const a1 = habitCellRange(rows.rowNumber, col);
  assert.equal(a1, `${REGISTRO_DIARIO_TAB}!${columnIndexToA1(col)}${rows.rowNumber}`);
});
