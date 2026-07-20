import { CalendarCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Hábitos' };

export default function HabitosPage() {
  return (
    <PlaceholderPage
      title="Hábitos"
      description="Seguimiento de tus hábitos diarios y rachas."
      icon={CalendarCheck}
      domain="habits"
      emptyTitle="Todavía no hay historial de hábitos"
      emptyDescription="Cuando se conecte Google Sheets, verás acá el detalle de cada hábito, su racha y la evolución semanal."
      preview={[
        'Racha por hábito',
        'Cumplimiento semanal',
        'Mapa de calor mensual',
        'Hábitos en riesgo',
      ]}
    />
  );
}
