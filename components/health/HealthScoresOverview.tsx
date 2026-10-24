import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { RhythmFeaturesViewModel } from '@/lib/health/rhythm-features-sheet';
import type { HealthScoreboard } from '@/lib/health/scores';

import styles from './HealthScoresOverview.module.scss';

const MEANINGS = [
  ['Readiness', 'Síntesis de sueño y estabilidad cardio.'],
  ['Sueño', 'Duración y regularidad del descanso.'],
  ['Recuperación', 'Sueño y señales cardio; falta carga de Gym.'],
  ['Actividad', 'Movimiento y pasos comparados con tu historia.'],
  ['Estabilidad cardio', 'FC en reposo y VFC cuando hay base válida.'],
  ['Movilidad', 'Cambios en tu patrón de marcha.'],
  ['Regularidad de sueño', 'Constancia de horarios nocturnos.'],
  ['Dirección reciente', 'Tendencia global: cerca de 50 es estable.'],
] as const;

type OverviewItem = {
  id: string;
  label: string;
  value: number | null;
  confidence: number | null;
  detail: string;
};

/** Lectura compacta de scores ya calculados: nunca agrega un score nuevo. */
export function HealthScoresOverview({
  scores,
  rhythm,
}: {
  scores: HealthScoreboard;
  rhythm: RhythmFeaturesViewModel;
}) {
  const rhythmValue = rhythm.result?.score ?? null;
  const items: OverviewItem[] = [
    ...scores.domains.map((score) => ({
      id: score.id,
      label: score.label,
      value: score.score,
      confidence: score.confidence,
      detail: score.score === null ? 'Datos insuficientes' : score.personalPosition,
    })),
    {
      id: 'rhythm',
      label: 'Regularidad de sueño',
      value: rhythmValue,
      confidence: rhythm.result?.confidence ?? null,
      detail: rhythmValue === null ? 'Noches insuficientes' : 'Horarios del sueño',
    },
    {
      id: 'momentum',
      label: 'Dirección reciente',
      value: scores.momentum.score,
      confidence: scores.momentum.confidence,
      detail:
        scores.momentum.direction === 'improving'
          ? 'Mejorando'
          : scores.momentum.direction === 'declining'
            ? 'Bajando'
            : scores.momentum.direction === 'stable'
              ? 'Estable'
              : 'Historia insuficiente',
    },
  ];

  return (
    <Card aria-labelledby="health-score-overview-title">
      <SectionHeader
        id="health-score-overview-title"
        title="Todos tus scores"
        description="Un vistazo a los dominios de Salud. Readiness está destacado arriba."
        domain="health"
      />
      <div className={styles.grid}>
        {items.map((item) => (
          <article key={item.id} className={styles.item}>
            <span className={styles.label}>{item.label}</span>
            <div className={styles.value}>
              <strong className="tabular">{item.value === null ? '—' : item.value}</strong>
              {item.value === null ? null : <small>/100</small>}
            </div>
            <span className={styles.detail}>{item.detail}</span>
            {item.confidence === null ? null : (
              <small className={styles.confidence}>Confianza {item.confidence}%</small>
            )}
          </article>
        ))}
      </div>

      <div className={styles.glossary}>
        <h3>Qué significa cada uno</h3>
        <dl>
          {MEANINGS.map(([label, description]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className={styles.caveat}>
        Índices orientativos, no diagnósticos ni predicciones de salud. «—» significa falta de
        datos, no un valor cero. La VFC se interpreta solo con historial suficiente.
      </p>
    </Card>
  );
}
