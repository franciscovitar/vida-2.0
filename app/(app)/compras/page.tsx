import { ShoppingCart } from 'lucide-react';
import type { Metadata } from 'next';

import { DocumentaryStableKeyPage } from '@/components/web-catalog/DocumentaryStableKeyPage';
import { WEB_CATALOG_FIXED_ROUTES } from '@/lib/web-catalog/section-labels';
import { requireAuthorizedSession } from '@/lib/auth/dal';

export const metadata: Metadata = { title: 'Compras' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ComprasPage() {
  await requireAuthorizedSession();

  return (
    <DocumentaryStableKeyPage
      stableKey={WEB_CATALOG_FIXED_ROUTES.compras.stableKey}
      placeholder={{
        title: 'Compras',
        description: 'Listas de compras y pendientes por comprar.',
        icon: ShoppingCart,
        domain: 'neutral',
        emptyTitle: 'Todavía no hay listas de compras',
        emptyDescription: 'Con el Registro Web activo verás acá el documento canónico de compras.',
        preview: ['Compras de la semana', 'Recurrentes', 'Deseos', 'Presupuesto estimado'],
      }}
    />
  );
}
