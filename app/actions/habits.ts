'use server';

/**
 * Acción de servidor para marcar/desmarcar un hábito autorizado.
 * Credenciales solo en servidor; respuesta siempre plana y serializable.
 * Requiere sesión Auth autorizada (además del Proxy).
 */
import { randomUUID } from 'node:crypto';

import { verifySession } from '@/lib/auth/dal';
import { unauthorizedSessionFailure } from '@/lib/auth/session-core';
import { googleHabitSheetPort } from '@/lib/habits/google-port';
import { toggleHabitWithPort } from '@/lib/habits/toggle';
import {
  HABIT_WRITE_MESSAGES,
  type ToggleHabitInput,
  type ToggleHabitResult,
} from '@/lib/habits/types';

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

  const session = await verifySession();
  if (!session.ok) {
    return JSON.parse(JSON.stringify(unauthorizedSessionFailure(operationId))) as ToggleHabitResult;
  }

  const payload: ToggleHabitInput = {
    targetDate: input.targetDate,
    habitName: input.habitName,
    nextValue: input.nextValue,
    expectedPreviousValue: input.expectedPreviousValue,
    operationId,
  };

  try {
    const result = await toggleHabitWithPort(payload, googleHabitSheetPort);
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
