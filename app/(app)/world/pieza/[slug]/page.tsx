import type { Metadata } from 'next';

import { WorldPieceView } from '@/components/world/WorldPiece';
import { getWorldPiecePageData } from '@/lib/data/world-source';

import pageStyles from '../../../page.module.scss';

export const metadata: Metadata = { title: 'Pieza · World' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function WorldPiecePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { pieceData, feedback } = await getWorldPiecePageData(slug);

  return (
    <div className={pageStyles.page}>
      <WorldPieceView data={pieceData} feedback={feedback} />
    </div>
  );
}
