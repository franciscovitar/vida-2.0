'use server';

import { randomUUID } from 'node:crypto';

import { verifySession } from '@/lib/auth/dal';
import {
  HEALTH_CHECKIN_WRITE_MESSAGES,
  type HealthCheckinInput,
  type HealthCheckinWriteResult,
  upsertHealthCheckinWithPort,
} from '@/lib/health/checkin';
import { googleHealthCheckinSheetPort } from '@/lib/health/checkin-sheet';

export type SaveHealthCheckinActionInput = Omit<HealthCheckinInput, 'operationId'> & {
  operationId?: string;
};

export async function saveHealthCheckinAction(
  input: SaveHealthCheckinActionInput,
): Promise<HealthCheckinWriteResult> {
  const operationId =
    typeof input.operationId === 'string' && input.operationId.trim() !== ''
      ? input.operationId
      : randomUUID();

  const session = await verifySession();
  if (!session.ok) {
    return {
      ok: false,
      code: 'unauthorized-session',
      operationId,
      message: HEALTH_CHECKIN_WRITE_MESSAGES['unauthorized-session'],
    };
  }

  try {
    const result = await upsertHealthCheckinWithPort(
      {
        ...input,
        operationId,
      },
      googleHealthCheckinSheetPort,
    );
    return JSON.parse(JSON.stringify(result)) as HealthCheckinWriteResult;
  } catch {
    return {
      ok: false,
      code: 'write-error',
      operationId,
      message: HEALTH_CHECKIN_WRITE_MESSAGES['write-error'],
    };
  }
}
