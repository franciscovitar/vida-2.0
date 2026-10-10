'use client';

import type { CareerResilienceHorizonKey, CareerResilienceRole } from '@/types/career-resilience';

import styles from './ProfessionalResilienceTimeline.module.scss';

const HORIZONS: { key: CareerResilienceHorizonKey; label: string }[] = [
  { key: 'Y1', label: '1 año' },
  { key: 'Y5', label: '5 años' },
  { key: 'Y10', label: '10 años' },
  { key: 'Y20', label: '20 años' },
];

const METRICS = [
  {
    key: 'aiAloneSubstitutionPressurePctRange',
    label: 'Presión de sustitución por IA sola',
    kind: 'pressure',
    suffix: '%',
    meaning: 'Rango de escenario sin calibración, no riesgo de despido.',
  },
  {
    key: 'aiNativeResilienceIndexRange',
    label: 'Resiliencia de un profesional con IA',
    kind: 'resilience',
    suffix: '',
    meaning: 'Índice heurístico, no probabilidad de conservar el empleo.',
  },
  {
    key: 'headcountCompressionIndexRange',
    label: 'Presión de reducción de plantillas',
    kind: 'compression',
    suffix: '',
    meaning: 'Índice heurístico, no porcentaje de puestos perdidos.',
  },
] as const;

export function ProfessionalResilienceTimeline({
  role,
  selected,
  onSelect,
}: {
  role: CareerResilienceRole;
  selected: CareerResilienceHorizonKey;
  onSelect: (horizon: CareerResilienceHorizonKey) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="resilience-timeline-title">
      <div className={styles.heading}>
        <h3 id="resilience-timeline-title">Cómo evolucionan los rangos</h3>
        <p>
          Los cuatro horizontes visibles a la vez, sin interpolar años intermedios. Todas las
          escalas van de 0 a 100. Los rangos son exploratorios, no intervalos estadísticos de
          confianza. Seleccioná un horizonte para actualizar el detalle de arriba.
        </p>
      </div>
      <div className={styles.grid}>
        {METRICS.map((metric) => (
          <article className={styles.card} key={metric.key}>
            <h4>{metric.label}</h4>
            <p className={styles.meaning}>{metric.meaning}</p>
            <ol className={styles.rows}>
              {HORIZONS.map(({ key, label }) => {
                const [lower, upper] = role.horizons[key][metric.key];
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={styles.row}
                      aria-pressed={selected === key}
                      onClick={() => onSelect(key)}
                      title={key === 'Y20' ? 'Prueba de estrés a veinte años' : undefined}
                    >
                      <span className={styles.year}>
                        {label}
                        {key === 'Y20' ? ' *' : ''}
                      </span>
                      <span className={styles.track} aria-hidden="true">
                        <span
                          className={styles.band}
                          data-kind={metric.kind}
                          style={{ left: lower + '%', width: upper - lower + '%' }}
                        />
                      </span>
                      <strong className={styles.value}>
                        {lower}–{upper}
                        {metric.suffix}
                      </strong>
                    </button>
                  </li>
                );
              })}
            </ol>
          </article>
        ))}
      </div>
      <p className={styles.footnote}>
        * 20 años es solo una prueba de estrés con incertidumbre muy alta. Que un rango se desplace
        no confirma que ese resultado vaya a ocurrir: es una hipótesis para revisar con nuevas
        evidencias.
      </p>
    </section>
  );
}
