'use server';

/**
 * Acción de servidor para marcar/desmarcar un hábito autorizado.
 * Credenciales solo en servidor; respuesta siempre plana y serializable.
 */
import { randomUUID } from 'node:crypto';

import { googleHabitSheetPort } from '@/lib/habits/google-port';
import { toggleHabitWithPort } from '@/lib/habits/toggle';
import type { ToggleHabitInput, ToggleHabitResult } from '@/lib/habits/types';
import { HABIT_WRITE_MESSAGES } from '@/lib/habits/types';

export type ToggleHabitActionInput = {
  targetDate: string;
  habitName: string;
  nextValue: boolean;
  expectedPreviousValue: boolean;
  operationId?: string;
};

/** Toggle seguro de un hábito. Nunca lanza errores de Google al cliente. */
export async function toggleHabitAction(input: ToggleHabitActionInput): Promise<ToggleHabitResult> {
  const operationId =
    typeof input.operationId === 'string' && input.operationId.trim() !== ''
      ? input.operationId
      : randomUUID();

  const payload: ToggleHabitInput = {
    targetDate: input.targetDate,
    habitName: input.habitName,
    nextValue: input.nextValue,
    expectedPreviousValue: input.expectedPreviousValue,
    operationId,
  };

  try {
    const result = await toggleHabitWithPort(payload, googleHabitSheetPort);
    // Round-trip para garantizar grafo JSON plano.
    return JSON.parse(JSON.stringify(result)) as ToggleHabitResult;
  } catch {
    return JSON.parse(
      JSON.stringify({
        ok: false,
        code: 'write-error',
        operationId,
        message: HABIT_WRITE_MESSAGES['write-error'],
      }),
    ) as ToggleHabitResult;
  }
}
