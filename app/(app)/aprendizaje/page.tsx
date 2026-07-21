import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Aprendizaje' };

export default function AprendizajePage() {
  return (
    <PlaceholderPage
      title="Aprendizaje"
      description="Cursos, lecturas y conocimiento en progreso."
      icon={BookOpen}
      domain="learning"
      emptyTitle="Todavía no hay aprendizaje registrado"
      emptyDescription="Con Notion conectado verás acá tus cursos, lecturas y notas de conocimiento con su avance."
      preview={['En progreso', 'Lecturas pendientes', 'Notas recientes', 'Tiempo dedicado']}
    />
  );
}
