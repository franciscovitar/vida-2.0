'use server';

import { randomUUID } from 'node:crypto';

import { verifySession } from '@/lib/auth/dal';
import {
  INTELLIGENCE_FEEDBACK_WRITE_MESSAGES,
  type IntelligenceFeedbackInput,
  type IntelligenceFeedbackWriteResult,
  upsertIntelligenceFeedbackWithPort,
} from '@/lib/intelligence/feedback';
import { googleIntelligenceFeedbackSheetPort } from '@/lib/intelligence/feedback-sheet';

export type SaveIntelligenceFeedbackActionInput = Omit<IntelligenceFeedbackInput, 'operationId'> & {
  operationId?: string;
};

export async function saveIntelligenceFeedbackAction(
  input: SaveIntelligenceFeedbackActionInput,
): Promise<IntelligenceFeedbackWriteResult> {
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
      message: INTELLIGENCE_FEEDBACK_WRITE_MESSAGES['unauthorized-session'],
    };
  }

  try {
    const result = await upsertIntelligenceFeedbackWithPort(
      {
        ...input,
        operationId,
      },
      googleIntelligenceFeedbackSheetPort,
    );
    return JSON.parse(JSON.stringify(result)) as IntelligenceFeedbackWriteResult;
  } catch {
    return {
      ok: false,
      code: 'write-error',
      operationId,
      message: INTELLIGENCE_FEEDBACK_WRITE_MESSAGES['write-error'],
    };
  }
}
