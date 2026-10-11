'use client';

import { useState } from 'react';

import expandedSalary from '@/data/generated/professional-salary-expanded-2026.json';
import type { ProfessionalIntelligenceData } from '@/types/professional-intelligence';

import styles from './ProfessionalSalaryPlot.module.scss';

const money = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);

type Group = 'direct' | 'adjacent' | 'future' | 'all';
type Level = 'all' | 'Junior' | 'Semi-Senior' | 'Senior';

const groups: { value: Group; label: string }[] = [
  { value: 'direct', label: 'Más cercanos' },
  { value: 'adjacent', label: 'Especializaciones' },
  { value: 'future', label: 'Evolución futura' },
  { value: 'all', label: 'Todos' },
];
const levels: { value: Level; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'Junior', label: 'Junior' },
  { value: 'Semi-Senior', label: 'Semi-Senior' },
  { value: 'Senior', label: 'Senior' },
];

export function ProfessionalSalaryPlot({ data }: { data: ProfessionalIntelligenceData }) {
  const [group, setGroup] = useState<Group>('direct');
  const [level, setLevel] = useState<Level>('all');

  const rows = expandedSalary.roles
    .filter((role) => group === 'all' || role.group === group)
    .flatMap((role) =>
      role.points
        .filter((point) => level === 'all' || point.label === level)
        .map((point) => ({
          key: role.id + '-' + point.label,
          label: role.role,
          original: role.sourceCategory,
          level: point.label,
          n: point.sampleSize,
          median: point.medianArsGrossMonthly,
        })),
    );
  const max = rows.reduce((value, row) => Math.max(value, row.median), 0);
  const original =
    data.status === 'ready' && data.snapshot ? data.snapshot.market.argentinaSalaryRoles : [];

  return (
    <section className={styles.section} aria-labelledby="professional-salaries-title">
      <header className={styles.header}>
        <p className={styles.eyebrow}>V04 · Salarios argentinos</p>
        <h2 id="professional-salaries-title">¿Cuánto se gana en distintas salidas de Sistemas?</h2>
        <p>
          Mediana bruta mensual en pesos · {expandedSalary.period} · encuesta OpenQube/Sysarmy. Las
          familias organizan la exploración, no certifican que ya cumplas los requisitos de cada
          puesto.
        </p>
      </header>

      <div className={styles.filters} role="group" aria-label="Familia de profesiones">
        {groups.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={group === option.value}
            onClick={() => setGroup(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className={styles.filters} role="group" aria-label="Experiencia en el puesto">
        {levels.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={level === option.value}
            onClick={() => setLevel(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {rows.length && max ? (
        <div className={styles.plot} aria-label="Medianas salariales por rol y experiencia">
          <div className={styles.scale} aria-hidden="true">
            <span>$0</span>
            <span>{money(max)}</span>
          </div>
          {rows.map((row) => (
            <div className={styles.row} key={row.key}>
              <div className={styles.label}>
                <strong>{row.label}</strong>
                <span>
                  {row.level} · n={row.n}
                </span>
              </div>
              <div
                className={styles.track}
                role="img"
                aria-label={
                  row.label +
                  ', ' +
                  row.level +
                  ': mediana bruta ' +
                  money(row.median) +
                  ', ' +
                  row.n +
                  ' respuestas'
                }
              >
                <span className={styles.dot} style={{ left: (row.median / max) * 100 + '%' }} />
              </div>
              <strong className={styles.value}>{money(row.median)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.footnote}>No hay una muestra suficiente para este filtro.</p>
      )}

      <p className={styles.footnote}>
        Reanálisis descriptivo de {expandedSalary.processedRowCount.toLocaleString('es-AR')}{' '}
        registros procesados: solo sueldos no dolarizados y grupos con n ≥ 20. Las medianas fueron
        calculadas sobre una versión depurada que excluye extremos; pueden diferir del gráfico
        oficial. No son ofertas actuales ni salarios garantizados.
      </p>
      <details className={styles.details}>
        <summary>Fuentes, método y categorías que no tienen datos suficientes</summary>
        <p>
          Fuente original:{' '}
          <a href={expandedSalary.sourceOriginal} target="_blank" rel="noreferrer">
            OpenQube / Sysarmy 2026.01
          </a>
          . Datos procesados y limpieza:{' '}
          <a href={expandedSalary.sourceProcessed} target="_blank" rel="noreferrer">
            conjunto comunitario reproducible
          </a>
          .{' '}
          <a href={expandedSalary.sourceProcessing} target="_blank" rel="noreferrer">
            Método de limpieza
          </a>
          . El procesamiento descartó valores extremos (percentiles 1 y 99). Encuesta
          autoseleccionada, no censo del mercado. Datos con licencia CC BY-NC-SA 4.0.
        </p>
        <p>
          Full-Stack y Backend están incluidos en la categoría original Developer; no se inventaron
          sueldos específicos para ellos. Analista funcional e ingeniería de IA aplicada no tienen
          aquí suficiente muestra comparable para graficarlos con el umbral elegido. No combinamos
          estas cifras con sueldos parcialmente dolarizados, ofertas remotas ni BLS.
        </p>
        {original.length > 0 ? (
          <div className={styles.tables}>
            <div>
              <h3>Valores del informe original guardados en Vida</h3>
              <p>
                Son una fuente procesada de manera distinta: quedan separados del reanálisis
                anterior.
              </p>
              {original.map((role) => (
                <div key={role.id}>
                  <strong>{role.role}</strong>
                  <ul>
                    {role.points
                      .filter((point) => !point.dollarized)
                      .map((point) => (
                        <li key={point.label}>
                          {point.label}: {money(point.medianArsGrossMonthly)} · n={point.sampleSize}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </details>
    </section>
  );
}
