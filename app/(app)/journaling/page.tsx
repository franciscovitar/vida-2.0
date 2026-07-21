import { NotebookPen } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Journaling' };

export default function JournalingPage() {
  return (
    <PlaceholderPage
      title="Journaling"
      description="Registro diario y reflexiones."
      icon={NotebookPen}
      domain="learning"
      emptyTitle="Todavía no hay entradas de journaling"
      emptyDescription="Con Notion conectado vas a poder escribir y revisar tus entradas diarias desde acá."
      preview={['Entrada de hoy', 'Estado de ánimo', 'Gratitud', 'Revisión semanal']}
    />
  );
}
