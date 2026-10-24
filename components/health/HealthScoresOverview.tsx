import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { RhythmFeaturesViewModel } from '@/lib/health/rhythm-features-sheet';
import type { HealthScoreboard } from '@/lib/health/scores';

import styles from './HealthScoresOverview.module.scss';

const MEANINGS = [
  ['Readiness', 'Si baja, tu descanso o tus señales cardíacas no vienen tan bien como de costumbre.'],
  ['Sueño', 'Si baja, quizá dormiste poco, estuviste más tiempo despierto en cama o venís durmiendo irregular.'],
  ['Recuperación', 'Si baja, el sueño o el pulso sugieren menos recuperación. Todavía no mide tu esfuerzo en el gimnasio.'],
  ['Actividad', 'Si baja, venís caminando poco o menos de lo habitual durante los últimos días.'],
  ['Estabilidad cardio', 'Si baja, tu pulso en reposo estuvo más alto de lo habitual o la VFC más baja, si ya hay historial.'],
  ['Movilidad', 'Si baja, caminaste más lento, con pasos más cortos o menos parejos que de costumbre.'],
  ['Regularidad de sueño', 'Si baja, tus horarios de dormir o despertar cambiaron mucho entre días, o dormiste duraciones distintas.'],
  ['Dirección reciente', 'Te muestra si en los últimos días venís mejorando, empeorando o parecido a antes. Cerca de 50 es estable.'],
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
