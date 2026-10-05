import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { listWorldItems } from '@/lib/world/contract';
import { loadWorldPiece, loadWorldSurface } from '@/lib/world/snapshot';
import {
  loadWorldTemporalIndex,
  loadWorldTemporalPeriod,
  selectWorldTemporalEntry,
} from '@/lib/world/temporal';
import { loadWorldFeedbackWithPort } from '@/lib/world/feedback';
import { worldFeedbackStorePort } from '@/lib/world/feedback-store';
import type {
  WorldPieceData,
  WorldTemporalGranularity,
  WorldTemporalPageData,
} from '@/types/world-intelligence';

export async function getWorldSurfaceData() {
  await requireAuthorizedSession();
  return loadWorldSurface();
}

export async function getWorldTemporalPageData(
  granularity: WorldTemporalGranularity,
  periodKey?: string | null,
): Promise<WorldTemporalPageData> {
  await requireAuthorizedSession();

  const [surface, index] = await Promise.all([loadWorldSurface(), loadWorldTemporalIndex()]);
  if (surface.status !== 'ready' || !surface.snapshot) {
    return {
      status: surface.status,
      notice: surface.notice,
      granularity,
      index,
      period: null,
      surface: null,
    };
  }

  if (!index) {
    return {
      status: 'missing',
      notice: 'La navegación temporal de World todavía no está disponible.',
      granularity,
      index: null,
      period: null,
      surface: surface.snapshot,
    };
  }

  const entry = selectWorldTemporalEntry(index, granularity, periodKey);
  if (!entry) {
    const label =
      granularity === 'WEEK'
        ? 'una semana cerrada'
        : granularity === 'MONTH'
          ? 'un mes archivado'
          : granularity === 'YEAR'
            ? 'un año archivado'
            : 'un día cerrado';

    return {
      status: 'ready',
      notice:
        granularity === 'DAY'
          ? 'Todavía no hay un cierre diario completo disponible. La próxima edición aparecerá automáticamente cuando cierre el día.'
          : `Todavía no hay ${label} disponible en esta escala.`,
      granularity,
      index,
      period: null,
      surface: surface.snapshot,
    };
  }

  const period = await loadWorldTemporalPeriod(entry);
  if (!period) {
    return {
      status: 'invalid',
      notice: 'El período temporal publicado no cumple el contrato de World.',
      granularity,
      index,
      period: null,
      surface: surface.snapshot,
    };
  }

  return {
    status: 'ready',
    notice: period.transitionNote ?? null,
    granularity,
    index,
    period,
    surface: surface.snapshot,
  };
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
