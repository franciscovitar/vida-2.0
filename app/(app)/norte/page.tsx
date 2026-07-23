import { Target } from 'lucide-react';
import type { Metadata } from 'next';

import { DocumentaryStableKeyPage } from '@/components/web-catalog/DocumentaryStableKeyPage';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { WEB_CATALOG_FIXED_ROUTES } from '@/lib/web-catalog/section-labels';

export const metadata: Metadata = { title: 'Norte' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function NortePage() {
  await requireAuthorizedSession();

  return (
    <DocumentaryStableKeyPage
      presentation="north"
      stableKey={WEB_CATALOG_FIXED_ROUTES.norte.stableKey}
      placeholder={{
        title: 'Norte',
        description: 'Temporada, prioridades, criterios de éxito y fuera de foco.',
        icon: Target,
        domain: 'projects',
        emptyTitle: 'El Norte todavía no está publicado',
        emptyDescription:
          'Con el Registro Web activo verás acá la dirección canónica de la temporada.',
        preview: ['Temporada actual', 'Objetivo principal', 'Prioridades', 'Fuera de foco'],
      }}
    />
  );
}
