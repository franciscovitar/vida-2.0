/**
 * Códigos de error públicos de escritura de hábitos.
 * Solo objetos planos serializables; sin Gaxios/Error/credenciales.
 */

export type HabitWriteErrorCode =
  | 'unauthorized-session'
  | 'unauthorized-spreadsheet'
  | 'unauthorized-column'
  | 'invalid-value'
  | 'row-not-found'
  | 'duplicate-date'
  | 'missing-header'
  | 'conflict'
  | 'permission-error'
  | 'verification-failed'
  | 'write-error';

export interface ToggleHabitInput {
  targetDate: string;
  habitName: string;
  nextValue: boolean;
  expectedPreviousValue: boolean;
  operationId: string;
}

export interface ToggleHabitSuccess {
  ok: true;
  targetDate: string;
  habitName: string;
  previousValue: boolean;
  currentValue: boolean;
  rowNumber: number;
  updatedAt: string;
  operationId: string;
}

export interface ToggleHabitFailure {
  ok: false;
  code: HabitWriteErrorCode;
  operationId: string;
  message: string;
}

export type ToggleHabitResult = ToggleHabitSuccess | ToggleHabitFailure;

export const HABIT_WRITE_MESSAGES: Record<HabitWriteErrorCode, string> = {
  'unauthorized-session': 'Tenés que iniciar sesión para modificar hábitos.',
  'unauthorized-spreadsheet': 'El spreadsheet no está autorizado.',
  'unauthorized-column': 'Esa columna de hábito no está autorizada.',
  'invalid-value': 'El valor del hábito no es válido.',
  'row-not-found': 'No hay una fila para la fecha indicada.',
  'duplicate-date': 'Hay más de una fila con la misma fecha.',
  'missing-header': 'Falta el encabezado del hábito en el Sheet.',
  conflict: 'El valor cambió en el Sheet. Actualizá e intentá de nuevo.',
  'permission-error': 'Sin permiso de escritura en el Sheet.',
  'verification-failed': 'No se pudo verificar la escritura.',
  'write-error': 'No se pudo guardar el hábito.',
};
