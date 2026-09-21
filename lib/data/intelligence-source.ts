import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import {
  loadIntelligenceArticle,
  loadIntelligenceEditorialSnapshot,
} from '@/lib/intelligence/snapshot';
import type { IntelligenceArticleData, IntelligenceFront } from '@/types/intelligence-editorial';

export async function getIntelligenceHubData() {
  await requireAuthorizedSession();
  return loadIntelligenceEditorialSnapshot();
}

export async function getIntelligenceArchiveData() {
  await requireAuthorizedSession();
  return loadIntelligenceEditorialSnapshot();
}

export async function getIntelligenceArticleData(
  front: string,
  slug: string,
): Promise<IntelligenceArticleData> {
  await requireAuthorizedSession();

  const editorial = await loadIntelligenceEditorialSnapshot();
  if (editorial.status !== 'ready' || !editorial.snapshot) {
    return {
      status: editorial.status,
      notice: editorial.notice,
      stale: false,
      summary: null,
      article: null,
    };
  }

  const summary =
    editorial.snapshot.archive.find(
      (item) => item.front === (front as IntelligenceFront) && item.slug === slug,
    ) ?? null;

  if (!summary) {
    return {
      status: 'missing',
      notice: 'El artículo solicitado no existe en el archivo editorial.',
      stale: false,
      summary: null,
      article: null,
    };
  }

  return loadIntelligenceArticle(editorial.snapshot, summary);
}
