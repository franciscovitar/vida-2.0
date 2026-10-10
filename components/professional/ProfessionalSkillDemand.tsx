'use client';

import { useState } from 'react';

import type { SkillDemandBaselineData } from '@/lib/professional/skill-demand-contract';

import styles from './ProfessionalSkillDemand.module.scss';

type Filter = 'all' | 'stack' | 'professional';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas las señales' },
  { key: 'stack', label: 'Tecnologías' },
  { key: 'professional', label: 'Capacidades' },
];

export function ProfessionalSkillDemand({ data }: { data: SkillDemandBaselineData }) {
  const [filter, setFilter] = useState<Filter>('all');

  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.unavailable} aria-label="Requisitos de ofertas observadas">
        {data.notice ?? 'Sin observaciones laborales aptas para publicar.'}
      </section>
    );
  }

  const { snapshot } = data;
  const visible = snapshot.entries.filter((entry) => filter === 'all' || entry.kind === filter);

  return (
    <section className={styles.section} aria-labelledby="observed-skill-demand-title">
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Mercado observado · muestra dirigida de 20 ofertas</p>
        <h2 id="observed-skill-demand-title">
          Qué tecnologías y capacidades aparecieron en las ofertas revisadas
        </h2>
        <p>
          Son <strong>menciones observadas en veinte anuncios seleccionados</strong> para puestos de
          software, full-stack y producto. Una oferta puede mencionar varias habilidades. El gráfico
          permite comparar diferencias dentro de esta muestra; no mide participación de mercado ni
          predice contratación.
        </p>
      </header>

      <div className={styles.metadata}>
        <span>
          <strong>Observado:</strong> {snapshot.source.observedAt}
        </span>
        <span>
          <strong>Muestra:</strong> {snapshot.sample.n} ofertas seleccionadas
        </span>
        <span>
          <strong>Ámbito:</strong> Córdoba, Argentina y remoto LATAM (mezclados)
        </span>
      </div>

      {data.notice ? (
        <p className={styles.warning} role="status">
          {data.notice}
        </p>
      ) : null}

      <div className={styles['scope-warning']}>
        <strong>Importante: no es un porcentaje del mercado.</strong> La muestra fue elegida
        deliberadamente e incluye seniorities y geografías diferentes. Por eso no sirve para decir
        que «React está presente en el 95% de las vacantes de Argentina» ni para comparar países o
        niveles junior.
      </div>

      <div className={styles.filters} role="group" aria-label="Filtrar los tipos de requisitos">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={styles.chart} role="region" aria-label="Gráfico de menciones en ofertas">
        {visible.map((entry) => (
          <div className={styles.row} key={entry.id}>
            <div className={styles['row-head']}>
              <span>{entry.label}</span>
              <strong>{entry.mentions} de 20</strong>
            </div>
            <div
              className={styles.track}
              role="img"
              aria-label={entry.label + ': ' + entry.mentions + ' menciones de 20 anuncios'}
            >
              <span className={styles.fill} style={{ width: entry.mentions * 5 + '%' }} />
            </div>
          </div>
        ))}
      </div>

      <aside className={styles['collection-status']}>
        <h3>Qué falta para medir tendencias reales</h3>
        <p>
          El registro de Job Search está creado, pero al comprobarlo no tenía observaciones ni
          resúmenes semanales cargados. Por eso todavía no podemos mostrar una evolución mensual de
          SQL, IA, AWS o seguridad, ni diferencias cuantitativas entre Córdoba, Argentina y LATAM.
        </p>
        <p>
          Cuando la búsqueda semanal acumule ofertas fechadas, deduplicadas y comparables, se podrá
          calcular cada frecuencia con su denominador real, geografía, nivel y ventana temporal.
          Hasta entonces, esa comparación permanece pendiente.
        </p>
      </aside>

      <footer className={styles.footer}>
        <strong>Fuente:</strong> PAS — Market-fit QA, 2 de octubre de 2026. Selección intencional,
        no censo de vacantes.{' '}
        <a
          href={
            'https://github.com/franciscovitar/personal-ai-system/blob/' +
            snapshot.source.commit +
            '/' +
            snapshot.source.evidenceDocumentRef
          }
          target="_blank"
          rel="noreferrer"
        >
          Ver las 20 ofertas, enlaces y método
        </a>
        . No se infiere salario, disponibilidad actual, seniority ni tendencia de los recuentos.
      </footer>
    </section>
  );
}
