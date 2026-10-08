import { createHash } from 'node:crypto';

import {
  HABIT_LOG_V2_TAB,
  HABIT_LOG_V2_VERSION,
  HABIT_REGISTRY_TAB,
  HABIT_REGISTRY_VERSION,
  habitAppliesOnDate,
  parseHabitLogV2Table,
  parseHabitRegistryTable,
  resolveHabitLogHead,
  resolveManualHabitValue,
  validYmd,
  type AddHabitV2Input,
  type DeactivateHabitV2Input,
  type HabitLogV2Record,
  type HabitRegistryRecord,
  type HabitV2MutationResult,
  type ToggleHabitV2Input,
} from '@/lib/habits/v2-contract';

type Cell = string | number | boolean | null;

export interface HabitV2SheetPort {
  readRegistry(): Promise<{ ok: true; values: Cell[][] } | { ok: false }>;
  readLog(): Promise<{ ok: true; values: Cell[][] } | { ok: false }>;
  readLegacy(): Promise<{ ok: true; values: Cell[][] } | { ok: false }>;
  putValues(
    rangeA1: string,
    values: readonly (readonly Cell[])[],
  ): Promise<{ ok: true } | { ok: false }>;
}

function failure(
  code: 'disabled' | 'invalid' | 'conflict' | 'unavailable' | 'not-found' | 'verification-failed',
  message: string,
): HabitV2MutationResult {
  return { ok: false, code, message };
}

function firstFreeRow(values: readonly (readonly Cell[])[]): number {
  for (let index = 1; index < values.length; index += 1) {
    if (!String(values[index]?.[0] ?? '').trim()) return index + 1;
  }
  return Math.max(2, values.length + 1);
}

function operationIdValid(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function registryRowCells(row: HabitRegistryRecord): Cell[] {
  return [
    row.habitId,
    row.name,
    row.icon ?? '',
    row.active,
    row.mode,
    row.cadence,
    row.target,
    row.unit,
    row.validFrom ?? '',
    row.validTo ?? '',
    row.derivedSource ?? '',
    row.legacyHeader ?? '',
    HABIT_REGISTRY_VERSION,
  ];
}

function logRowCells(row: HabitLogV2Record): Cell[] {
  return [
    row.entryId,
    row.date,
    row.habitId,
    row.value,
    row.source,
    row.replacesEntryId ?? '',
    row.registeredAt,
    HABIT_LOG_V2_VERSION,
  ];
}

function habitIdFor(payload: AddHabitV2Input): string {
  return `habit-${createHash('sha256')
    .update(`${payload.operationId}\u0000${payload.name.trim().toLocaleLowerCase('es')}`)
    .digest('hex')
    .slice(0, 12)}`;
}

async function load(
  port: HabitV2SheetPort,
): Promise<
  | {
      ok: true;
      registryValues: Cell[][];
      logValues: Cell[][];
      legacyValues: Cell[][] | null;
      registry: HabitRegistryRecord[];
      log: HabitLogV2Record[];
    }
  | { ok: false; result: HabitV2MutationResult }
> {
  const [registryRead, logRead, legacyRead] = await Promise.all([
    port.readRegistry(),
    port.readLog(),
    port.readLegacy(),
  ]);
  if (!registryRead.ok || !logRead.ok) {
    return {
      ok: false,
      result: failure('unavailable', 'Habit Registry / Habit Log V2 no están disponibles.'),
    };
  }

  const registry = parseHabitRegistryTable(registryRead.values);
  const log = parseHabitLogV2Table(logRead.values);
  if (!registry.ok || !log.ok) {
    return {
      ok: false,
      result: failure('unavailable', 'El esquema de Hábitos V2 no pudo verificarse.'),
    };
  }

  return {
    ok: true,
    registryValues: registryRead.values,
    logValues: logRead.values,
    legacyValues: legacyRead.ok ? legacyRead.values : null,
    registry: registry.rows,
    log: log.rows,
  };
}

export function createHabitsV2WriteService(input: {
  port: HabitV2SheetPort;
  today: string;
  writesEnabled: boolean;
  now?: () => string;
}) {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async toggle(payload: ToggleHabitV2Input): Promise<HabitV2MutationResult> {
      if (!input.writesEnabled) return failure('disabled', 'Escrituras de Hábitos V2 desactivadas.');
      if (
        !validYmd(payload.targetDate) ||
        payload.targetDate > input.today ||
        !payload.habitId.trim() ||
        typeof payload.nextValue !== 'boolean' ||
        typeof payload.expectedPreviousValue !== 'boolean' ||
        !operationIdValid(payload.operationId)
      ) {
        return failure('invalid', 'Cambio de hábito inválido.');
      }

      const loaded = await load(input.port);
      if (!loaded.ok) return loaded.result;

      const habit = loaded.registry.find((row) => row.habitId === payload.habitId);
      if (!habit) return failure('not-found', 'Hábito no encontrado.');
      if (habit.mode !== 'manual') {
        return failure('invalid', 'Los hábitos automáticos se corrigen en su fuente canónica.');
      }
      if (!habitAppliesOnDate(habit, payload.targetDate)) {
        return failure('invalid', 'El hábito no estaba activo para esa fecha.');
      }

      const entryId =
        `vida2:habit:v2:${habit.habitId}:${payload.targetDate}:${payload.operationId}`;
      const replay = loaded.log.find((row) => row.entryId === entryId);
      if (replay) {
        if (
          replay.habitId === habit.habitId &&
          replay.date === payload.targetDate &&
          replay.value === payload.nextValue
        ) {
          return { ok: true, code: 'idempotent', message: 'El cambio ya estaba registrado.' };
        }
        return failure('conflict', 'La operación ya existe con otro payload.');
      }

      const current = resolveManualHabitValue({
        habit,
        date: payload.targetDate,
        today: input.today,
        logRows: loaded.log,
        legacyValues: loaded.legacyValues,
      });
      if (!current.ok || current.value === null) {
        return failure('unavailable', current.reason ?? 'No se pudo verificar el valor actual.');
      }
      if (current.value !== payload.expectedPreviousValue) {
        return failure('conflict', 'El hábito cambió desde que abriste la vista. Actualizá.');
      }
      if (current.value === payload.nextValue) {
        return { ok: true, code: 'idempotent', message: 'No había cambio para guardar.' };
      }

      // Re-read immediately before the bounded write: never choose a row or
      // correction parent using a stale snapshot. This is optimistic detection,
      // NOT an atomic Sheets transaction (Production still requires serialization).
      const fresh = await load(input.port);
      if (!fresh.ok) return fresh.result;
      const freshHabit = fresh.registry.find((row) => row.habitId === habit.habitId);
      if (!freshHabit || freshHabit.mode !== 'manual' || !habitAppliesOnDate(freshHabit, payload.targetDate)) {
        return failure('conflict', 'La configuración del hábito cambió. Actualizá.');
      }
      if (fresh.log.some((row) => row.entryId === entryId)) {
        return failure('conflict', 'La operación apareció mientras se verificaba. Actualizá.');
      }
      const freshValue = resolveManualHabitValue({
        habit: freshHabit,
        date: payload.targetDate,
        today: input.today,
        logRows: fresh.log,
        legacyValues: fresh.legacyValues,
      });
      if (
        !freshValue.ok ||
        freshValue.value !== current.value ||
        freshValue.entryId !== current.entryId ||
        firstFreeRow(fresh.logValues) !== firstFreeRow(loaded.logValues)
      ) {
        return failure('conflict', 'El historial cambió antes de guardar. Actualizá.');
      }

      const source = current.origin === 'none' ? 'manual' : 'manual-correction';
      const record: HabitLogV2Record = {
        rowNumber: firstFreeRow(loaded.logValues),
        entryId,
        date: payload.targetDate,
        habitId: habit.habitId,
        value: payload.nextValue,
        source,
        replacesEntryId: current.entryId,
        registeredAt: now(),
        version: HABIT_LOG_V2_VERSION,
      };

      const range = `${HABIT_LOG_V2_TAB}!A${record.rowNumber}:H${record.rowNumber}`;
      const written = await input.port.putValues(range, [logRowCells(record)]);
      if (!written.ok) return failure('unavailable', 'No se pudo guardar el hábito.');

      const verifyRead = await input.port.readLog();
      if (!verifyRead.ok) return failure('verification-failed', 'No se pudo verificar el cambio.');
      const verifiedLog = parseHabitLogV2Table(verifyRead.values);
      if (!verifiedLog.ok) {
        return failure('verification-failed', 'Habit Log V2 quedó en un estado no verificable.');
      }
      const verifiedEntry = verifiedLog.rows.find((row) => row.entryId === entryId);
      const head = resolveHabitLogHead(verifiedLog.rows, habit.habitId, payload.targetDate);
      if (
        !verifiedEntry ||
        verifiedEntry.value !== payload.nextValue ||
        !head.ok ||
        head.row?.entryId !== entryId
      ) {
        return failure('verification-failed', 'La corrección no pudo verificarse.');
      }

      return { ok: true, code: 'applied', message: 'Hábito guardado y verificado.' };
    },

    async addManual(payload: AddHabitV2Input): Promise<HabitV2MutationResult> {
      if (!input.writesEnabled) return failure('disabled', 'Escrituras de Hábitos V2 desactivadas.');
      const name = payload.name.trim();
      const unit = payload.unit.trim() || 'vez';
      if (
        name.length < 2 ||
        name.length > 80 ||
        (payload.cadence !== 'daily' && payload.cadence !== 'weekly') ||
        !Number.isInteger(payload.target) ||
        payload.target < 1 ||
        payload.target > 31 ||
        !operationIdValid(payload.operationId)
      ) {
        return failure('invalid', 'Configuración de hábito inválida.');
      }

      const loaded = await load(input.port);
      if (!loaded.ok) return loaded.result;
      const habitId = habitIdFor(payload);
      const existing = loaded.registry.find((row) => row.habitId === habitId);
      if (existing) {
        if (
          existing.name === name &&
          existing.mode === 'manual' &&
          existing.cadence === payload.cadence &&
          existing.target === payload.target &&
          existing.unit === unit
        ) {
          return { ok: true, code: 'idempotent', message: 'El hábito ya estaba creado.' };
        }
        return failure('conflict', 'La operación ya existe con otra configuración.');
      }

      const duplicateName = loaded.registry.find(
        (row) =>
          row.active && row.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'),
      );
      if (duplicateName) return failure('conflict', 'Ya existe un hábito activo con ese nombre.');

      // The Registry may have changed while the form was open; re-read before PUT.
      const fresh = await load(input.port);
      if (!fresh.ok) return fresh.result;
      if (
        firstFreeRow(fresh.registryValues) !== firstFreeRow(loaded.registryValues) ||
        fresh.registry.some((row) =>
          row.habitId === habitId ||
          (row.active && row.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))
        )
      ) {
        return failure('conflict', 'El registro de hábitos cambió. Actualizá.');
      }

      const rowNumber = firstFreeRow(fresh.registryValues);
      const record: HabitRegistryRecord = {
        rowNumber,
        habitId,
        name,
        icon: payload.icon?.trim() || null,
        active: true,
        mode: 'manual',
        cadence: payload.cadence,
        target: payload.target,
        unit,
        validFrom: input.today,
        validTo: null,
        derivedSource: null,
        legacyHeader: null,
        version: HABIT_REGISTRY_VERSION,
      };

      const range = `${HABIT_REGISTRY_TAB}!A${rowNumber}:M${rowNumber}`;
      const written = await input.port.putValues(range, [registryRowCells(record)]);
      if (!written.ok) return failure('unavailable', 'No se pudo crear el hábito.');

      const verifyRead = await input.port.readRegistry();
      if (!verifyRead.ok) return failure('verification-failed', 'No se pudo verificar el hábito.');
      const verified = parseHabitRegistryTable(verifyRead.values);
      const after = verified.ok ? verified.rows.find((row) => row.habitId === habitId) : null;
      if (!after || !after.active || after.name !== name || after.validFrom !== input.today) {
        return failure('verification-failed', 'El hábito creado no pudo verificarse.');
      }

      return { ok: true, code: 'applied', message: 'Hábito creado y verificado.' };
    },

    async deactivate(payload: DeactivateHabitV2Input): Promise<HabitV2MutationResult> {
      if (!input.writesEnabled) return failure('disabled', 'Escrituras de Hábitos V2 desactivadas.');
      if (!payload.habitId.trim() || !operationIdValid(payload.operationId)) {
        return failure('invalid', 'Desactivación inválida.');
      }

      const loaded = await load(input.port);
      if (!loaded.ok) return loaded.result;
      const habit = loaded.registry.find((row) => row.habitId === payload.habitId);
      if (!habit) return failure('not-found', 'Hábito no encontrado.');
      if (!habit.active) {
        return { ok: true, code: 'idempotent', message: 'El hábito ya estaba desactivado.' };
      }
      if (payload.expectedActive !== habit.active) {
        return failure('conflict', 'El hábito cambió antes de desactivarse. Actualizá.');
      }

      const fresh = await load(input.port);
      if (!fresh.ok) return fresh.result;
      const freshHabit = fresh.registry.find((row) => row.habitId === habit.habitId);
      if (
        !freshHabit ||
        freshHabit.rowNumber !== habit.rowNumber ||
        !freshHabit.active ||
        freshHabit.validTo !== habit.validTo ||
        freshHabit.validFrom !== habit.validFrom
      ) {
        return failure('conflict', 'El hábito cambió antes de desactivarse. Actualizá.');
      }

      const range = `${HABIT_REGISTRY_TAB}!D${habit.rowNumber}:J${habit.rowNumber}`;
      const values: Cell[][] = [
        [
          false,
          habit.mode,
          habit.cadence,
          habit.target,
          habit.unit,
          habit.validFrom ?? '',
          input.today,
        ],
      ];
      const written = await input.port.putValues(range, values);
      if (!written.ok) return failure('unavailable', 'No se pudo desactivar el hábito.');

      const verifyRead = await input.port.readRegistry();
      if (!verifyRead.ok) {
        return failure('verification-failed', 'No se pudo verificar la desactivación.');
      }
      const verified = parseHabitRegistryTable(verifyRead.values);
      const after = verified.ok
        ? verified.rows.find((row) => row.habitId === habit.habitId)
        : null;
      if (!after || after.active || after.validTo !== input.today) {
        return failure('verification-failed', 'La desactivación no pudo verificarse.');
      }

      return { ok: true, code: 'applied', message: 'Hábito desactivado; el historial se conserva.' };
    },
  };
}
