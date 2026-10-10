'use client';

import { useState } from 'react';

import type { SkillDemandBaselineData } from '@/lib/professional/skill-demand-contract';
import {
  observedExperienceCounts,
  observedGeographyCounts,
  observedSkillCounts,
  type ObservedJobSampleData,
} from '@/lib/professional/observed-jobs-contract';

import styles from './ProfessionalSkillDemand.module.scss';

type Filter = 'all' | 'stack' | 'professional';
type SourceSelection = 'recent' | 'historical';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas las señales' },
  { key: 'stack', label: 'Tecnologías' },
  { key: 'professional', label: 'Capacidades' },
];

type Count = { id: string; label: string; mentions: number };

function Bars({ entries, n, name }: { entries: readonly Count[]; n: number; name: string }) {
  return (
    <div className={styles.chart} role="region" aria-label={name}>
      {entries.map((entry) => (
        <div className={styles.row} key={entry.id}>
          <div className={styles['row-head']}>
            <span>{entry.label}</span>
            <strong>
              {entry.mentions} de {n}
            </strong>
          </div>
          <div
            className={styles.track}
            role="img"
            aria-label={entry.label + ': ' + entry.mentions + ' ofertas de ' + n}
          >
            <span
              className={styles.fill}
              style={{ width: (n > 0 ? (entry.mentions / n) * 100 : 0) + '%' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfessionalSkillDemand({
  data,
  observed,
}: {
  data: SkillDemandBaselineData;
  observed: ObservedJobSampleData;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selection, setSelection] = useState<SourceSelection>('recent');

  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.unavailable} aria-label="Requisitos de ofertas observadas">
        {data.notice ?? 'Sin observaciones laborales aptas para publicar.'}
      </section>
    );
  }

  const historical = data.snapshot;
  const newer = observed.status === 'ready' ? observed.snapshot : null;
  const recent = newer !== null && selection === 'recent';
  const n = recent ? newer.sample.n : historical.sample.n;
  const bars = recent
    ? observedSkillCounts(newer.observations)
    : historical.entries.filter((entry) => filter === 'all' || entry.kind === filter);

  return (
    <section className={styles.section} aria-labelledby="observed-skill-demand-title">
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Mercado observado · muestras seleccionadas, no censos</p>
        <h2 id="observed-skill-demand-title">
          Qué tecnologías y capacidades aparecieron en las ofertas revisadas
        </h2>
        <p>
          Cada barra cuenta <strong>menciones dentro de la muestra elegida</strong>. Una misma
          oferta puede mencionar varias tecnologías. Estas cantidades no miden la demanda total del
          mercado, la tasa de contratación ni una tendencia entre períodos.
        </p>
      </header>

      <div className={styles['source-options']} role="group" aria-label="Seleccionar la muestra">
        {newer ? (
          <button type="button" aria-pressed={recent} onClick={() => setSelection('recent')}>
            Registro 10 oct · {newer.sample.n} ofertas
          </button>
        ) : null}
        <button type="button" aria-pressed={!recent} onClick={() => setSelection('historical')}>
          Muestra histórica 2 oct · {historical.sample.n} ofertas
        </button>
      </div>

      <div className={styles.metadata}>
        <span>
          <strong>Observado:</strong>{' '}
          {recent ? newer.source.observedAt : historical.source.observedAt}
        </span>
        <span>
          <strong>Muestra:</strong> {n} ofertas seleccionadas
        </span>
        <span>
          <strong>Ámbito:</strong> Córdoba, Argentina y remoto LATAM (mezclados)
        </span>
      </div>

      {recent && observed.notice ? (
        <p className={styles.warning} role="status">
          {observed.notice}
        </p>
      ) : !recent && data.notice ? (
        <p className={styles.warning} role="status">
          {data.notice}
        </p>
      ) : null}
      {!newer && observed.notice ? (
        <p className={styles.warning} role="status">
          Las observaciones más recientes están pendientes: {observed.notice}
        </p>
      ) : null}

      <div className={styles['scope-warning']}>
        <strong>Importante: no son porcentajes del mercado.</strong>{' '}
        {recent
          ? 'Este registro manual incluye edades de publicación, puestos y geografías diferentes. No representa todas las vacantes abiertas ni se puede comparar como tendencia con la muestra del 2 de octubre.'
          : 'Estas veinte ofertas fueron elegidas deliberadamente y combinan seniorities y geografías. No sirven para estimar la demanda total ni comparar regiones.'}
      </div>

      {!recent ? (
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
      ) : (
        <h3 className={styles['sub-heading']}>Tecnologías explícitas · {n} ofertas observadas</h3>
      )}

      <Bars entries={bars} n={n} name="Menciones de habilidades en ofertas seleccionadas" />

      {recent ? (
        <>
          <p className={styles['method-note']}>
            Etiquetas agrupadas a partir de los requisitos «must-have» registrados. Por ejemplo,
            React incluye React Native; Cloud/DevOps reúne AWS, Docker, Kubernetes y CI/CD. Las
            menciones pueden superponerse. No son todas las habilidades posibles de cada oferta.
          </p>

          <div className={styles['sample-panels']}>
            <article className={styles['sample-panel']} aria-labelledby="observed-experience-title">
              <h3 id="observed-experience-title">V05 · Experiencia exigida en estos avisos</h3>
              <p>Años mínimos explícitos, separados de anuncios que no los informan.</p>
              <Bars
                entries={observedExperienceCounts(newer.observations)}
                n={n}
                name="Años de experiencia declarados en la muestra"
              />
              <p className={styles['method-note']}>
                Además, {newer.observations.filter((item) => /\bjunior\b/i.test(item.role)).length}{' '}
                títulos dicen «Junior», aunque eso no equivale necesariamente a exigir 0–2 años.
              </p>
            </article>

            <article className={styles['sample-panel']} aria-labelledby="observed-geography-title">
              <h3 id="observed-geography-title">V08 · Dónde buscamos las ofertas</h3>
              <p>Composición geográfica del registro; no compara la demanda de regiones.</p>
              <Bars
                entries={observedGeographyCounts(newer.observations)}
                n={n}
                name="Composición geográfica de las ofertas seleccionadas"
              />
              <p className={styles['method-note']}>
                «Sin clasificar» significa que la publicación no permitió asignar una región
                compatible con el criterio usado, no que la vacante carezca de ubicación.
              </p>
            </article>
          </div>

          <details className={styles['sample-sources']}>
            <summary>Ver las {n} ofertas y sus fuentes</summary>
            <ul>
              {newer.observations.map((item) => (
                <li key={item.key}>
                  <a href={item.url} rel="noreferrer" target="_blank">
                    {item.company} · {item.role}
                  </a>
                  {item.seenInHistoricalSample ? ' · También figuraba en la muestra anterior' : ''}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}

      <aside className={styles['collection-status']}>
        <h3>Qué se puede afirmar con estos registros</h3>
        {newer ? (
          <>
            <p>
              La planilla de Job Search tiene {newer.sample.n} observaciones registradas el{' '}
              {newer.source.observedAt}; {newer.sample.historicalUrlOverlaps} URLs también aparecían
              en la muestra histórica, por lo que no son {newer.sample.n} oportunidades
              completamente nuevas.
            </p>
            <p>
              Seguimos sin ventanas de búsqueda equivalentes y repetidas. La evolución mensual, las
              tasas de demanda por región y los rankings generales de tecnología permanecen
              <strong> pendientes</strong>.
            </p>
          </>
        ) : (
          <p>
            La captura histórica está disponible, pero no pudimos validar un derivado actualizado de
            las observaciones. No inferimos nuevas vacantes ni tendencias.
          </p>
        )}
      </aside>

      <footer className={styles.footer}>
        {recent ? (
          <>
            <strong>Fuente:</strong> Google Sheets — Job Search Market Evidence V1, pestaña
            Observations, corte {newer.source.observedAt}.{' '}
            <a
              href={
                'https://docs.google.com/spreadsheets/d/' + newer.source.spreadsheetId + '/edit'
              }
              rel="noreferrer"
              target="_blank"
            >
              Consultar la evidencia registrada
            </a>
            . Publicaciones visibles en LinkedIn; no se ha confirmado que todos los empleadores
            mantengan abierto su proceso de selección.
          </>
        ) : (
          <>
            <strong>Fuente:</strong> PAS — Market-fit QA, 2 de octubre de 2026.{' '}
            <a
              href={
                'https://github.com/franciscovitar/personal-ai-system/blob/' +
                historical.source.commit +
                '/' +
                historical.source.evidenceDocumentRef
              }
              target="_blank"
              rel="noreferrer"
            >
              Ver las 20 ofertas y la metodología
            </a>
            . Selección intencional, no censo de vacantes.
          </>
        )}
      </footer>
    </section>
  );
}
