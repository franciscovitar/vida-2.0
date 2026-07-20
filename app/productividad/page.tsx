import { ListTodo } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Productividad' };

export default function ProductividadPage() {
  return (
    <PlaceholderPage
      title="Productividad"
      description="Tiempo de foco y uso de la computadora."
      icon={ListTodo}
      domain="productivity"
      emptyTitle="Todavía no hay registros de productividad"
      emptyDescription="Con ActivityWatch y Google Sheets conectados verás el desglose de tu tiempo por categoría y su evolución."
      preview={[
        'Tiempo por área',
        'Comparación semanal',
        'Foco vs. distracción',
        'Horas de PC activa',
      ]}
    />
  );
}
