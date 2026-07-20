/**
 * Fechas de activación por hábito (civiles YYYY-MM-DD, Argentina).
 *
 * Origen: primera fila de «Registro diario» (Sheet DEV) en la que la columna
 * del hábito tiene un valor booleano (true o false). No se inventan fechas:
 * cada entrada documenta esa primera aparición observada.
 *
 * Actualizado tras auditoría Fase 3A (2026-07-20).
 */
import { RD } from '@/lib/google/constants';

/** Mapa tipado: encabezado exacto del Sheet → fecha de activación. */
export type HabitActivationMap = Readonly<Record<string, string>>;

/**
 * Fecha de activación de cada hábito autorizado.
 * Antes de esta fecha el día es `unavailable` para ese hábito.
 */
export const HABIT_ACTIVATION_DATES: HabitActivationMap = {
  // Primera aparición booleana en Sheet DEV: 2026-07-12.
  [RD.firstAlarm]: '2026-07-12',
  // Primera aparición booleana en Sheet DEV: 2026-07-17.
  [RD.bed]: '2026-07-17',
  // Primera aparición booleana en Sheet DEV: 2026-07-17.
  [RD.shower]: '2026-07-17',
  // Primera aparición booleana en Sheet DEV: 2026-07-12.
  [RD.posture]: '2026-07-12',
  // Primera aparición booleana en Sheet DEV: 2026-07-12.
  [RD.gym]: '2026-07-12',
  // Primera aparición booleana en Sheet DEV: 2026-07-12.
  [RD.cardio]: '2026-07-12',
  // Primera aparición booleana en Sheet DEV: 2026-07-12.
  [RD.stretch]: '2026-07-12',
  // Primera aparición booleana en Sheet DEV: 2026-07-12.
  [RD.mealPrep]: '2026-07-12',
  // Primera aparición booleana en Sheet DEV: 2026-07-12.
  [RD.journaling]: '2026-07-12',
  // Primera aparición booleana en Sheet DEV: 2026-07-12.
  [RD.football]: '2026-07-12',
};

/** Fecha de activación de un hábito, o null si no está tipada. */
export function habitActivationDate(habitName: string): string | null {
  return HABIT_ACTIVATION_DATES[habitName] ?? null;
}

/** Hábitos autorizados sin fecha de activación tipada (no debería ocurrir). */
export function habitsMissingActivation(habitNames: readonly string[]): string[] {
  return habitNames.filter((name) => habitActivationDate(name) === null);
}
