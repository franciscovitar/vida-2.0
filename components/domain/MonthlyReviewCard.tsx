import { BrainCircuit, CalendarRange } from 'lucide-react';

import { CopyAnalysisButton } from '@/components/domain/CopyAnalysisButton';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

import styles from './MonthlyReviewCard.module.scss';

type MonthlyReviewDomain = 'gym' | 'nutrition';

const COPY: Record<MonthlyReviewDomain, { title: string; description: string; prompt: string; checks: string[] }> = {
  gym: {
    title: 'Revisión mensual a demanda',
    description: '30 días de rendimiento, rutina, cardio, movilidad, recuperación y eficiencia.',
    prompt:
      'Analizá mis últimos 30 días de entrenamiento usando mi rutina actual y mi historial real. Separá hechos, tendencias e hipótesis. Revisá adherencia, progresión por ejercicios comparables, cardio y carga aeróbica, movilidad solo si hay una limitación medida, recuperación y posibles señales de descarga. No cambies nada por una sesión aislada: proponé cambios solo si hay evidencia repetida o una incompatibilidad clara con mis objetivos. Priorizá obtener mejores resultados con el mismo o menor tiempo/fricción. Si conviene mantener todo igual, decilo explícitamente. Para cada cambio sugerido indicá por qué, qué probar, durante cuánto tiempo y qué resultado haría mantenerlo o revertirlo.',
    checks: ['Progreso y adherencia', 'Cardio + movilidad', 'Descarga y eficiencia'],
  },
  nutrition: {
    title: 'Revisión mensual a demanda',
    description: '30 días de energía, macros, micros, alimentos, suplementos y fricción del plan.',
    prompt:
      'Analizá mis últimos 30 días de Nutrition Intelligence contra mi objetivo actual. Separá datos observados de inferencias. Revisá adherencia y cobertura del registro, energía, macros cuando estén suficientemente completos, micronutrientes cuando haya cobertura útil, patrones de alimentos y suplementos solo si están realmente registrados. Proponé cambios únicamente si hay un problema repetido, una oportunidad relevante o una forma de obtener el mismo resultado con menos esfuerzo/fricción. No inventes déficits ni precisión que los datos no sostienen. Si conviene mantener el plan, decilo. Para cada ajuste indicá evidencia, acción mínima, período de prueba y señal para mantener/revertir.',
    checks: ['Energía y macros', 'Micros + suplementos', 'Adherencia y eficiencia'],
  },
};

export function MonthlyReviewCard({ domain }: { domain: MonthlyReviewDomain }) {
  const copy = COPY[domain];
  return (
    <Card aria-labelledby={`monthly-review-${domain}`}>
      <SectionHeader
        id={`monthly-review-${domain}`}
        title={copy.title}
        description={copy.description}
        domain="health"
      />
      <div className={styles.layout}>
        <div className={styles.copy}>
          <span className={styles.icon} aria-hidden="true">
            <CalendarRange size={20} />
          </span>
          <div>
            <strong>No corre solo ni cambia el plan automáticamente.</strong>
            <p>
              Cuando quieras revisar el mes, copiá este pedido y mandalo al coach. La regla es
              conservar lo que funciona y cambiar sólo lo que tenga evidencia suficiente.
            </p>
          </div>
        </div>
        <div className={styles.actions}>
          <div className={styles.checks}>
            {copy.checks.map((check) => (
              <span key={check}>{check}</span>
            ))}
          </div>
          <CopyAnalysisButton text={copy.prompt} />
        </div>
      </div>
      <div className={styles.footer}>
        <BrainCircuit size={15} aria-hidden="true" />
        <span>El análisis debe usar tus fuentes reales del período, no una recomendación genérica.</span>
      </div>
    </Card>
  );
}
