'use client';

import { useState } from 'react';

import {
  FORECAST_HORIZONS,
  type ForecastHorizon,
  type ForecastOutlook,
  type ProfessionalHorizonData,
} from '@/lib/professional/horizon-contract';

import styles from './ProfessionalHorizonComparison.module.scss';

const HORIZON_LABELS: Record<ForecastHorizon, string> = {
  NEAR_12_24M: '1–2 años',
  MID_3_5Y: '3–5 años',
  LONG_5_10Y: '5–10 años',
};

const OUTLOOK_LABELS: Record<ForecastOutlook, string> = {
  STRONG_POSITIVE: 'Señal muy favorable',
  POSITIVE: 'Favorable',
  POSITIVE_BUT_TRANSFORMING: 'Favorable, con cambios',
  MIXED: 'Señales mixtas',
  PRESSURE_ON_ROUTINE_TASKS: 'Presión sobre tareas',
  UNCERTAIN: 'Incierto',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: 'Alta',
  MEDIUM_HIGH: 'Media-alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

export function ProfessionalHorizonComparison({ data }: { data: ProfessionalHorizonData }) {
  const [selectedRole, setSelectedRole] = useState('ai-native-product-software-engineering');
  const [selectedHorizon, setSelectedHorizon] = useState<ForecastHorizon>('NEAR_12_24M');

  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.unavailable} aria-label="Futuro profesional">
        {data.notice ?? 'Los pronósticos profesionales no están disponibles.'}
      </section>
    );
  }

  const snapshot = data.snapshot;
  const profile = snapshot.profiles.find((item) => item.id === selectedRole);
  const phase = profile?.horizons[selectedHorizon];

  return (
    <section className={styles.section} aria-labelledby="professional-horizons-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Tu carrera en el tiempo · seis áreas</p>
        <h2 id="professional-horizons-title">Qué cambia a corto, medio y largo plazo</h2>
        <p>
          Compará perspectivas de cada área sin reducirlas a un top. Estas son evaluaciones
          direccionales de PAS, no vacantes actuales ni probabilidades de que la IA elimine una
          profesión.
        </p>
        <p className={styles.context}>
          Para el mercado actual, mirá los datos de empleo anteriores. Los pronósticos comienzan en
          12–24 meses y la incertidumbre aumenta con el tiempo.
        </p>
      </div>

      {data.notice ? (
        <p className={styles.notice} role="status">
          {data.notice}
        </p>
      ) : null}

      <div
        className={styles['matrix-scroll']}
        role="region"
        aria-label="Comparador temporal de áreas profesionales"
        tabIndex={0}
      >
        <table className={styles.matrix}>
          <caption>
            Seis áreas y tres horizontes. Elegí una celda para ver los motivos y las señales que
            podrían cambiarla.
          </caption>
          <thead>
            <tr>
              <th scope="col">Área profesional</th>
              {FORECAST_HORIZONS.map((key) => (
                <th scope="col" key={key}>
                  {HORIZON_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.profiles.map((role) => (
              <tr key={role.id}>
                <th scope="row">{role.label}</th>
                {FORECAST_HORIZONS.map((key) => {
                  const outlook = role.horizons[key];
                  const active = selectedRole === role.id && selectedHorizon === key;
                  return (
                    <td key={key}>
                      <button
                        type="button"
                        className={styles.cell}
                        data-active={active}
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedRole(role.id);
                          setSelectedHorizon(key);
                        }}
                      >
                        <span className={styles.outlook} data-outlook={outlook.outlook}>
                          {OUTLOOK_LABELS[outlook.outlook]}
                        </span>
                        <span className={styles.confidence}>
                          Confianza {CONFIDENCE_LABELS[outlook.confidence].toLowerCase()}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {profile && phase ? (
        <article className={styles.detail} aria-live="polite" aria-atomic="true">
          <div className={styles['detail-head']}>
            <div>
              <p className={styles.eyebrow}>Detalle de la comparación seleccionada</p>
              <h3>{profile.label}</h3>
              <p className={styles['selection-meta']}>
                {HORIZON_LABELS[selectedHorizon]} · {OUTLOOK_LABELS[phase.outlook]} · confianza{' '}
                {CONFIDENCE_LABELS[phase.confidence].toLowerCase()}
              </p>
            </div>
          </div>
          <p className={styles.summary}>{phase.aiInteractionEs}</p>
          <div className={styles['signpost-grid']}>
            <div>
              <h4>Señales a seguir</h4>
              <ul>
                {profile.signpostsUp.map((item) => (
                  <li key={item.original}>{item.es}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Qué cuestionaría este escenario</h4>
              <ul>
                {profile.signpostsDown.map((item) => (
                  <li key={item.original}>{item.es}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className={styles.action}>
            <strong>Si el escenario cambia</strong>
            <p>{profile.action.es}</p>
          </div>
        </article>
      ) : null}

      <footer className={styles.footer}>
        <strong>Cómo leerlo:</strong> «favorable» no significa mejor trabajo para vos; no incluye
        barreras de entrada, salarios argentinos ni tu evidencia personal. Es el escenario base, sin
        proyecciones calibradas para adopción más rápida o más lenta de IA. Fuente: PAS, pronóstico
        observado {snapshot.source.observedAt} ·{' '}
        <a
          href={
            'https://github.com/franciscovitar/personal-ai-system/blob/' +
            snapshot.source.commit +
            '/' +
            snapshot.source.canonicalRef
          }
          target="_blank"
          rel="noreferrer"
        >
          ver fundamentos
        </a>
        .
      </footer>
    </section>
  );
}
