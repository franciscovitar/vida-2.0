import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { listWorldItems } from '@/lib/world/contract';
import { loadWorldPiece, loadWorldSurface } from '@/lib/world/snapshot';
import { loadWorldFeedbackWithPort } from '@/lib/world/feedback';
import { worldFeedbackStorePort } from '@/lib/world/feedback-store';
import type { WorldPieceData } from '@/types/world-intelligence';

export async function getWorldSurfaceData() {
  await requireAuthorizedSession();
  return loadWorldSurface();
}

export async function getWorldPieceData(slug: string): Promise<WorldPieceData> {
  await requireAuthorizedSession();

  const surface = await loadWorldSurface();
  if (surface.status !== 'ready' || !surface.snapshot) {
    return {
      status: surface.status,
      notice: surface.notice,
      stale: false,
      summary: null,
      piece: null,
    };
  }

  const summary = listWorldItems(surface.snapshot).find((item) => item.slug === slug) ?? null;
  if (!summary) {
    return {
      status: 'missing',
      notice: 'La pieza solicitada no existe en la superficie publicada de World.',
      stale: false,
      summary: null,
      piece: null,
    };
  }

  return loadWorldPiece(surface.snapshot, summary);
}

export async function getWorldPieceDataByBriefId(
  briefId: string,
  options?: { skipSessionCheck?: boolean },
): Promise<WorldPieceData> {
  if (!options?.skipSessionCheck) await requireAuthorizedSession();

  const surface = await loadWorldSurface();
  if (surface.status !== 'ready' || !surface.snapshot) {
    return {
      status: surface.status,
      notice: surface.notice,
      stale: false,
      summary: null,
      piece: null,
    };
  }

  const summary = listWorldItems(surface.snapshot).find((item) => item.briefId === briefId) ?? null;
  if (!summary) {
    return {
      status: 'missing',
      notice: 'La pieza solicitada no existe en la superficie publicada de World.',
      stale: false,
      summary: null,
      piece: null,
    };
  }

  return loadWorldPiece(surface.snapshot, summary);
}

export async function getWorldPiecePageData(slug: string) {
  await requireAuthorizedSession();
  const pieceData = await getWorldPieceData(slug);
  const feedback =
    pieceData.status === 'ready' && pieceData.piece
      ? await loadWorldFeedbackWithPort(pieceData.piece, worldFeedbackStorePort)
      : {
          writable: false,
          state: 'unavailable' as const,
          notice: 'Feedback temporalmente no disponible.',
          feedback: null,
        };

  return { pieceData, feedback };
}
