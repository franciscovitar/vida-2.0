'use client';

import { useState } from 'react';

import type { ProfessionalIntelligenceData } from '@/types/professional-intelligence';

import styles from './ProfessionalSalaryPlot.module.scss';

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);

export function ProfessionalSalaryPlot({ data }: { data: ProfessionalIntelligenceData }) {
  const [selectedLevel, setSelectedLevel] = useState('all');

  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.section} aria-label="Sueldos argentinos">
        <p>{data.notice ?? 'No hay salarios con fuente verificable para mostrar.'}</p>
      </section>
    );
  }

  const roles = data.snapshot.market.argentinaSalaryRoles;
  const regular = roles.flatMap((role) =>
    role.points
      .filter(
        (point) =>
          !point.dollarized &&
          Number.isFinite(point.medianArsGrossMonthly) &&
          point.medianArsGrossMonthly > 0 &&
          Number.isInteger(point.sampleSize) &&
          point.sampleSize > 0,
      )
      .map((point) => ({
        key: role.id + ':' + point.label,
        role: role.role,
        period: role.period,
        source: role.sourceLabel,
        url: role.sourceUrl,
        point,
      })),
  );
  const dollarized = roles.flatMap((role) =>
    role.points
      .filter((point) => point.dollarized)
      .map((point) => ({
        key: role.id + ':' + point.label,
        role: role.role,
        point,
      })),
  );
  const levels = [...new Set(regular.map((item) => item.point.label))];
  const max = regular.reduce((acc, item) => Math.max(acc, item.point.medianArsGrossMonthly), 0);
  const entries = regular.filter(
    (item) => selectedLevel === 'all' || item.point.label === selectedLevel,
  );
  const source = regular[0];
  const commonPeriod = [...new Set(roles.map((role) => role.period))].join(' · ');

  return (
    <section className={styles.section} aria-labelledby="professional-salaries-title">
      <header className={styles.header}>
        <p className={styles.eyebrow}>V04 · Sueldos en Argentina</p>
        <h2 id="professional-salaries-title">¿Cuánto se gana según el área y el seniority?</h2>
        <p>
          Medianas mensuales brutas en pesos de una encuesta salarial, no sueldos ofrecidos en
          vacantes. Período {commonPeriod}. Referencia histórica: revisar antes de negociar.
        </p>
      </header>

      {regular.length > 0 && max > 0 ? (
        <>
          <div className={styles.filters} role="group" aria-label="Filtrar por seniority">
            <button
              type="button"
              aria-pressed={selectedLevel === 'all'}
              onClick={() => setSelectedLevel('all')}
            >
              Todos
            </button>
            {levels.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={selectedLevel === level}
                onClick={() => setSelectedLevel(level)}
              >
                {level}
              </button>
            ))}
          </div>

          <div
            className={styles.plot}
            aria-label="Comparación de medianas salariales por área y seniority"
          >
            <div className={styles.scale} aria-hidden="true">
              <span>$0</span>
              <span>{formatMoney(max)}</span>
            </div>
            {entries.map(({ key, role, point }) => (
              <div className={styles.row} key={key}>
                <div className={styles.label}>
                  <strong>{role}</strong>
                  <span>
                    {point.label} · n={point.sampleSize}
                  </span>
                </div>
                <div
                  className={styles.track}
                  role="img"
                  aria-label={
                    role +
                    ', ' +
                    point.label +
                    ': mediana ' +
                    formatMoney(point.medianArsGrossMonthly) +
                    ', muestra ' +
                    point.sampleSize
                  }
                >
                  <span
                    className={styles.dot}
                    style={{ left: (point.medianArsGrossMonthly / max) * 100 + '%' }}
                  />
                </div>
                <strong className={styles.value}>{formatMoney(point.medianArsGrossMonthly)}</strong>
              </div>
            ))}
          </div>

          <details className={styles.details}>
            <summary>Ver todos los valores, tamaños de muestra y otras categorías</summary>
            <div className={styles.tables}>
              {roles.map((role) => (
                <div key={role.id}>
                  <h3>{role.role}</h3>
                  <ul>
                    {role.points.map((point) => (
                      <li key={point.label}>
                        {point.label}: {formatMoney(point.medianArsGrossMonthly)} brutos/mes · n=
                        {point.sampleSize}
                        {point.dollarized
                          ? ' · sueldo al menos parcialmente dolarizado, no comparable'
                          : ''}
                      </li>
                    ))}
                  </ul>
                  <a href={role.sourceUrl} target="_blank" rel="noreferrer">
                    {role.sourceLabel}
                  </a>
                </div>
              ))}
            </div>
          </details>
          {dollarized.length > 0 ? (
            <p className={styles.footnote}>
              {dollarized.length} categorías con remuneración al menos parcialmente dolarizada
              quedan fuera del gráfico. Se pueden consultar en el detalle sin mezclarlas con las
              medianas del resto.
            </p>
          ) : null}
          <p className={styles.footnote}>
            Fuente:{' '}
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.source}
            </a>
            . Argentina, {commonPeriod}; n se refiere a respuestas de la encuesta, no a ofertas.
            Este gráfico no debe compararse como salario equivalente con las proyecciones BLS de
            Estados Unidos mostradas arriba.
          </p>
        </>
      ) : (
        <p className={styles.footnote}>
          No hay medianas no dolarizadas con muestra suficiente en el snapshot actual. No mostramos
          puntos inventados.
        </p>
      )}
    </section>
  );
}
