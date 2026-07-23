import { UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';

import { DocumentaryStableKeyPage } from '@/components/web-catalog/DocumentaryStableKeyPage';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { WEB_CATALOG_FIXED_ROUTES } from '@/lib/web-catalog/section-labels';

export const metadata: Metadata = { title: 'Dieta' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DietaPage() {
  await requireAuthorizedSession();

  return (
    <DocumentaryStableKeyPage
      presentation="diet"
      stableKey={WEB_CATALOG_FIXED_ROUTES.dieta.stableKey}
      placeholder={{
        title: 'Dieta',
        description: 'Meal prep, comidas rápidas, compras y criterios de alimentación.',
        icon: UtensilsCrossed,
        domain: 'health',
        emptyTitle: 'La guía de alimentación todavía no está publicada',
        emptyDescription:
          'Con el Registro Web activo verás acá el documento canónico de dieta y meal prep.',
        preview: [
          'Objetivo y criterios',
          'Meal prep semanal',
          'Comidas rápidas',
          'Lista principal',
        ],
      }}
    />
  );
}
