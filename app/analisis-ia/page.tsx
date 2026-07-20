import { Brain } from 'lucide-react';
import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/layout/PlaceholderPage';

export const metadata: Metadata = { title: 'Análisis IA' };

export default function AnalisisIaPage() {
  return (
    <PlaceholderPage
      title="Análisis IA"
      description="Resúmenes y patrones detectados en tus datos."
      icon={Brain}
      domain="productivity"
      emptyTitle="El análisis todavía no está disponible"
      emptyDescription="Cuando haya datos reales conectados, acá se generarán resúmenes, correlaciones y sugerencias a partir de tu semana."
      preview={[
        'Resumen semanal',
        'Correlaciones sueño-energía',
        'Alertas tempranas',
        'Sugerencias de foco',
      ]}
    />
  );
}
