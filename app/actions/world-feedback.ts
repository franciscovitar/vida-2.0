'use server';

import { randomUUID } from 'node:crypto';

import { verifySession } from '@/lib/auth/dal';
import { getWorldPieceDataByBriefId } from '@/lib/data/world-source';
import {
  WORLD_FEEDBACK_WRITE_MESSAGES,
  isWorldFeedbackValue,
  type WorldFeedbackInput,
  type WorldFeedbackWriteResult,
  upsertWorldFeedbackWithPort,
} from '@/lib/world/feedback';
import { ensureWorldFeedbackBriefRegistered } from '@/lib/world/feedback-postgres';
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

  if (!isWorldFeedbackValue(input.feedback)) {
    return {
      ok: false,
      code: 'invalid-value',
      operationId,
      message: WORLD_FEEDBACK_WRITE_MESSAGES['invalid-value'],
    };
  }

  const pieceData = await getWorldPieceDataByBriefId(input.briefId, { skipSessionCheck: true });
  if (pieceData.status !== 'ready' || !pieceData.piece) {
    return {
      ok: false,
      code: 'unknown-brief',
      operationId,
      message: WORLD_FEEDBACK_WRITE_MESSAGES['unknown-brief'],
    };
  }

  try {
    const registration = await ensureWorldFeedbackBriefRegistered(pieceData.piece);
    if (!registration.ok) {
      const code =
        registration.code === 'metadata-mismatch'
          ? 'metadata-mismatch'
          : registration.code === 'permission-error'
            ? 'permission-error'
            : registration.code === 'not-configured'
              ? 'not-configured'
              : 'write-error';

      return {
        ok: false,
        code,
        operationId,
        message: WORLD_FEEDBACK_WRITE_MESSAGES[code],
      };
    }

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
