/**
 * Lógica de toggle de hábito: validación + read-check-write-verify.
 * No es una transacción perfecta; minimiza la ventana de concurrencia.
 */
import { todayInBuenosAires } from '@/lib/adapters/dates';
import { getGoogleConfig } from '@/lib/data/config';
import { ALLOWED_SPREADSHEET_ID, isAllowedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

import { isAuthorizedHabitName } from './authorized';
import {
  coerceHabitBoolean,
  findHabitColumn,
  findRowsForDate,
  habitCellRange,
  isValidYmd,
} from './sheet-locate';
import type { HabitSheetPort } from './sheet-port';
import {
  HABIT_WRITE_MESSAGES,
  type HabitWriteErrorCode,
  type ToggleHabitFailure,
  type ToggleHabitInput,
  type ToggleHabitResult,
} from './types';

function fail(code: HabitWriteErrorCode, operationId: string): ToggleHabitFailure {
  return {
    ok: false,
    code,
    operationId,
    message: HABIT_WRITE_MESSAGES[code],
  };
}

function assertPlainBooleans(input: ToggleHabitInput): ToggleHabitFailure | null {
  if (typeof input.nextValue !== 'boolean') return fail('invalid-value', input.operationId);
  if (typeof input.expectedPreviousValue !== 'boolean') {
    return fail('invalid-value', input.operationId);
  }
  if (typeof input.habitName !== 'string' || input.habitName.trim() === '') {
    return fail('unauthorized-column', input.operationId);
  }
  if (typeof input.operationId !== 'string' || input.operationId.trim() === '') {
    return fail('invalid-value', input.operationId);
  }
  if (typeof input.targetDate !== 'string' || !isValidYmd(input.targetDate)) {
    return fail('invalid-value', input.operationId);
  }
  return null;
}

/**
 * Ejecuta el toggle contra un puerto de Sheet (real o mock de pruebas).
 */
export async function toggleHabitWithPort(
  input: ToggleHabitInput,
  port: HabitSheetPort,
  options?: { today?: string; spreadsheetId?: string },
): Promise<ToggleHabitResult> {
  const operationId = input.operationId;
  const basic = assertPlainBooleans(input);
  if (basic) return basic;

  if (!isAuthorizedHabitName(input.habitName)) {
    return fail('unauthorized-column', operationId);
  }

  let sheetId = options?.spreadsheetId;
  if (!sheetId) {
    const cfg = getGoogleConfig();
    if (!cfg.ok) return fail('write-error', operationId);
    sheetId = cfg.config.spreadsheetId;
  }

  if (!isAllowedSpreadsheetId(sheetId) || sheetId !== ALLOWED_SPREADSHEET_ID) {
    return fail('unauthorized-spreadsheet', operationId);
  }

  const today = options?.today ?? todayInBuenosAires();
  if (input.targetDate !== today) {
    return fail('invalid-value', operationId);
  }

  const tab = await port.readRegistroDiario();
  if (!tab.ok) {
    if (tab.code === 'permission-error') return fail('permission-error', operationId);
    return fail('write-error', operationId);
  }

  const header = tab.values[0] ?? [];
  const columnNumber = findHabitColumn(header, input.habitName);
  if (columnNumber === null) {
    return fail('missing-header', operationId);
  }

  const rows = findRowsForDate(tab.values, input.targetDate);
  if (rows.kind === 'none') return fail('row-not-found', operationId);
  if (rows.kind === 'duplicate') return fail('duplicate-date', operationId);

  const rangeA1 = habitCellRange(rows.rowNumber, columnNumber);

  // 1) Leer inmediatamente antes de escribir.
  const before = await port.readCell(rangeA1);
  if (!before.ok) {
    if (before.code === 'permission-error') return fail('permission-error', operationId);
    return fail('write-error', operationId);
  }

  const current = coerceHabitBoolean(before.value);
  if (current === null) return fail('invalid-value', operationId);

  // 2) Comprobar expectedPreviousValue — sin escribir si no coincide.
  if (current !== input.expectedPreviousValue) {
    return fail('conflict', operationId);
  }

  if (input.nextValue === current) {
    return {
      ok: true,
      targetDate: input.targetDate,
      habitName: input.habitName,
      previousValue: current,
      currentValue: current,
      rowNumber: rows.rowNumber,
      updatedAt: new Date().toISOString(),
      operationId,
    };
  }

  // 3) Escribir una única celda.
  const written = await port.writeCell(rangeA1, input.nextValue);
  if (!written.ok) {
    if (written.code === 'permission-error') return fail('permission-error', operationId);
    return fail('write-error', operationId);
  }

  // 4) Verificar releyendo la misma celda.
  const after = await port.readCell(rangeA1);
  if (!after.ok) return fail('verification-failed', operationId);
  const verified = coerceHabitBoolean(after.value);
  if (verified !== input.nextValue) return fail('verification-failed', operationId);

  return {
    ok: true,
    targetDate: input.targetDate,
    habitName: input.habitName,
    previousValue: current,
    currentValue: verified,
    rowNumber: rows.rowNumber,
    updatedAt: new Date().toISOString(),
    operationId,
  };
}
