import { Boxes } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Proyectos' };

export default function ProyectosPage() {
  return (
    <PlaceholderPage
      title="Proyectos"
      description="Tus proyectos activos por área."
      icon={Boxes}
      domain="projects"
      emptyTitle="Todavía no hay proyectos sincronizados"
      emptyDescription="Cuando se conecte Notion aparecerán acá tus proyectos con su progreso, tareas abiertas y área asignada."
      preview={[
        'Proyectos activos',
        'Progreso por proyecto',
        'Tareas abiertas',
        'Áreas relacionadas',
      ]}
    />
  );
}
