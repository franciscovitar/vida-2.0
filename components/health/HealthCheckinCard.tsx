import { HeartPulse } from 'lucide-react';

import { HealthCheckinForm } from '@/components/health/HealthCheckinForm';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { loadTodayHealthCheckin } from '@/lib/health/checkin-google-port';

export async function HealthCheckinCard() {
  const initial = await loadTodayHealthCheckin();

  return (
    <Card aria-labelledby="health-checkin-title">
      <SectionHeader
        id="health-checkin-title"
        title="¿Cómo estás hoy?"
        description="Tres respuestas rápidas para sumar contexto subjetivo a tu historial. No es un diagnóstico."
        domain="health"
        icon={HeartPulse}
      />
      <HealthCheckinForm initial={initial} />
    </Card>
  );
}
