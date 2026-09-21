import type { Metadata } from 'next';

import { IntelligenceArticleView } from '@/components/intelligence/IntelligenceArticle';
import { getIntelligenceArticleData } from '@/lib/data/intelligence-source';
import { loadIntelligenceFeedbackSnapshot } from '@/lib/intelligence/feedback-sheet';

import pageStyles from '../../../page.module.scss';

export const metadata: Metadata = { title: 'Artículo · Inteligencia' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function InteligenciaArticlePage({
  params,
}: {
  params: Promise<{ front: string; slug: string }>;
}) {
  const { front, slug } = await params;
  const data = await getIntelligenceArticleData(front, slug);
  const feedback =
    data.status === 'ready' && data.article
      ? await loadIntelligenceFeedbackSnapshot(data.article.articleId)
      : {
          writable: false,
          state: 'unavailable' as const,
          notice: null,
          feedback: null,
        };

  return (
    <div className={pageStyles.page}>
      <IntelligenceArticleView data={data} feedback={feedback} />
    </div>
  );
}
