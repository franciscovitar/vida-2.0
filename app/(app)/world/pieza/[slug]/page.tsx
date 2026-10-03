import type { Metadata } from 'next';

import { WorldPieceView } from '@/components/world/WorldPiece';
import { getWorldPieceData } from '@/lib/data/world-source';

import pageStyles from '../../../page.module.scss';

export const metadata: Metadata = { title: 'Pieza · World' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function WorldPiecePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getWorldPieceData(slug);

  return (
    <div className={pageStyles.page}>
      <WorldPieceView data={data} />
    </div>
  );
}
