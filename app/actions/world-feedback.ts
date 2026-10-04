'use server';

import { randomUUID } from 'node:crypto';

import { verifySession } from '@/lib/auth/dal';
import { getWorldPieceData } from '@/lib/data/world-source';
import {
  WORLD_FEEDBACK_WRITE_MESSAGES,
  type WorldFeedbackInput,
  type WorldFeedbackWriteResult,
  upsertWorldFeedbackWithPort,
} from '@/lib/world/feedback';
import { worldFeedbackStorePort } from '@/lib/world/feedback-store';

export type SaveWorldFeedbackActionInput = Omit<WorldFeedbackInput, 'operationId'> & {
  operationId?: string;
};

export async function saveWorldFeedbackAction(
  input: SaveWorldFeedbackActionInput,
): Promise<WorldFeedbackWriteResult> {
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
      message: WORLD_FEEDBACK_WRITE_MESSAGES['unauthorized-session'],
    };
  }

  const pieceData = await getWorldPieceDataByBriefId(input.briefId);
  if (pieceData.status !== 'ready' || !pieceData.piece) {
    return {
      ok: false,
      code: 'unknown-brief',
      operationId,
      message: WORLD_FEEDBACK_WRITE_MESSAGES['unknown-brief'],
    };
  }

  try {
    return await upsertWorldFeedbackWithPort(
      {
        briefId: input.briefId,
        feedback: input.feedback,
        operationId,
      },
      pieceData.piece,
      worldFeedbackStorePort,
    );
  } catch {
    return {
      ok: false,
      code: 'write-error',
      operationId,
      message: WORLD_FEEDBACK_WRITE_MESSAGES['write-error'],
    };
  }
}

async function getWorldPieceDataByBriefId(briefId: string) {
  const { getWorldPieceDataByBriefId: loadByBriefId } = await import('@/lib/data/world-source');
  return loadByBriefId(briefId, { skipSessionCheck: true });
}
