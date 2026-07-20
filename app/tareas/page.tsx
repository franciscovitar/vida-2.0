import { CheckSquare } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Tareas' };

export default function TareasPage() {
  return (
    <PlaceholderPage
      title="Tareas"
      description="Todas tus tareas, filtrables por área y prioridad."
      icon={CheckSquare}
      domain="tasks"
      emptyTitle="Todavía no hay tareas sincronizadas"
      emptyDescription="Al conectar Notion vas a ver acá todas tus tareas con proyecto, área, prioridad y fecha límite."
      preview={['Vencen hoy', 'Por prioridad', 'Por proyecto', 'Completadas recientes']}
    />
  );
}
