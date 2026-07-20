import { HeartPulse } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Salud' };

export default function SaludPage() {
  return (
    <PlaceholderPage
      title="Salud"
      description="Sueño, actividad física y señales de tu cuerpo."
      icon={HeartPulse}
      domain="health"
      emptyTitle="Todavía no hay datos de salud"
      emptyDescription="Al conectar Google Sheets se mostrarán las tendencias de sueño, frecuencia cardíaca, pasos y energía a lo largo del tiempo."
      preview={['Tendencia de sueño', 'Sueño profundo vs. ligero', 'FC en reposo', 'Pasos diarios']}
    />
  );
}
