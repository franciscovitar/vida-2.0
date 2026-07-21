import { ShoppingCart } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Compras' };

export default function ComprasPage() {
  return (
    <PlaceholderPage
      title="Compras"
      description="Listas de compras y pendientes por comprar."
      icon={ShoppingCart}
      domain="neutral"
      emptyTitle="Todavía no hay listas de compras"
      emptyDescription="Cuando se conecte Notion vas a ver acá tus listas de compras organizadas por categoría."
      preview={['Compras de la semana', 'Recurrentes', 'Deseos', 'Presupuesto estimado']}
    />
  );
}
