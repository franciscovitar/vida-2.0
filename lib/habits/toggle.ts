/**
 * Lógica de toggle de hábito: validación + read-check-write-verify.
 * No es una transacción perfecta; minimiza la ventana de concurrencia.
 *
 * El spreadsheet se toma solo del target resuelto (servidor). Nunca desde el cliente.
 */
import { todayInBuenosAires } from '@/lib/adapters/dates';
import { getGoogleConfig } from '@/lib/data/config';
import type {
  SpreadsheetTargetEnv,
  SpreadsheetTargetOk,
} from '@/lib/google/spreadsheet-target-core';
import { assertResolvedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

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

function resolveWriteTarget(
  options: ToggleHabitPortOptions | undefined,
  operationId: string,
): SpreadsheetTargetOk | ToggleHabitFailure {
  if (options?.resolved) {
    return options.resolved;
  }

  const cfg = getGoogleConfig(options?.env ?? process.env);
  if (!cfg.ok) {
    return fail('unauthorized-spreadsheet', operationId);
  }

  return {
    ok: true,
    target: cfg.config.target,
    spreadsheetId: cfg.config.spreadsheetId,
    allowProdWrites: cfg.config.allowProdWrites,
    writesAllowed: cfg.config.writesAllowed,
  };
}

export type ToggleHabitPortOptions = {
  today?: string;
  /**
   * Target ya resuelto (tests / servidor). Nunca un spreadsheetId suelto del cliente.
   */
  resolved?: SpreadsheetTargetOk;
  /** Env inyectable en tests para getGoogleConfig. */
  env?: SpreadsheetTargetEnv;
};

/**
 * Ejecuta el toggle contra un puerto de Sheet (real o mock de pruebas).
 */
export async function toggleHabitWithPort(
  input: ToggleHabitInput,
  port: HabitSheetPort,
  options?: ToggleHabitPortOptions,
): Promise<ToggleHabitResult> {
  const operationId = input.operationId;
  const basic = assertPlainBooleans(input);
  if (basic) return basic;

  if (!isAuthorizedHabitName(input.habitName)) {
    return fail('unauthorized-column', operationId);
  }

  const resolvedOrFail = resolveWriteTarget(options, operationId);
  if (!('target' in resolvedOrFail)) {
    return resolvedOrFail;
  }
  const resolved = resolvedOrFail;

  // Escritura: DEV siempre (a nivel target); PROD solo con writesAllowed.
  if (!resolved.writesAllowed) {
    return fail('unauthorized-spreadsheet', operationId);
  }

  try {
    assertResolvedSpreadsheetId(resolved.spreadsheetId, resolved.spreadsheetId);
  } catch {
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

  // Defensa: una sola celda (sin ':').
  if (rangeA1.includes(':')) {
    return fail('write-error', operationId);
  }

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
