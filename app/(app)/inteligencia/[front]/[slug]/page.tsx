import type { Metadata } from 'next';

import { IntelligenceArticleView } from '@/components/intelligence/IntelligenceArticle';
import { getIntelligenceArticleData } from '@/lib/data/intelligence-source';

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

  return (
    <div className={pageStyles.page}>
      <IntelligenceArticleView data={data} />
    </div>
  );
}
