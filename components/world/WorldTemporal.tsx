import { CalendarRange, CircleAlert, Clock3, Layers3 } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { WORLD_DOMAINS, worldDomainLabel, worldPieceHref } from '@/lib/world/contract';
import type {
  WorldCoverageState,
  WorldDomainOutcome,
  WorldPieceSummary,
  WorldTemporalGranularity,
  WorldTemporalPageData,
} from '@/types/world-intelligence';

import { WorldNavigation } from './WorldNavigation';
import styles from './World.module.scss';

function minutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function granularityLabel(granularity: WorldTemporalGranularity): string {
  if (granularity === 'DAY') return 'Día';
  if (granularity === 'WEEK') return 'Semana';
  if (granularity === 'MONTH') return 'Mes';
  return 'Año';
}

function coverageLabel(state: WorldCoverageState): string {
  if (state === 'COVERAGE_OK') return 'Cobertura suficiente';
  if (state === 'COVERAGE_PARTIAL') return 'Cobertura parcial';
  return 'Cobertura no disponible';
}

function outcomeText(outcome: WorldDomainOutcome): string | null {
  if (outcome === 'NO_MATERIAL_CHANGE') {
    return 'No hubo cambios materiales que sobrevivieran el coverage pass.';
  }
  if (outcome === 'COVERAGE_PARTIAL') {
    return 'Hay información verificada, pero la cobertura no alcanza para afirmar que este panorama sea completo.';
  }
  if (outcome === 'COVERAGE_FAILED') {
    return 'No hubo cobertura suficiente para construir un resumen confiable de este dominio.';
  }
  return null;
}

function DeepDiveCard({ item }: { item: WorldPieceSummary }) {
  return (
    <Card as="article" className={styles['piece-card']}>
      <div className={styles['card-meta']}>
        <span>En profundidad</span>
        <span>{worldDomainLabel(item.primaryDomain)}</span>
        <span className={styles['reading-time']}>
          <Clock3 size={13} aria-hidden="true" />
          {minutes(item.readingSeconds)}
        </span>
      </div>
      <h3>{item.headline}</h3>
      <p>{item.deck}</p>
      <Link className={styles['read-link']} href={worldPieceHref(item)}>
        Entenderlo bien →
      </Link>
    </Card>
  );
}

function ArchiveLinks({
  data,
  granularity,
}: {
  data: WorldTemporalPageData;
  granularity: WorldTemporalGranularity;
}) {
  if (!data.index || (granularity !== 'MONTH' && granularity !== 'YEAR')) return null;

  const entries = granularity === 'MONTH' ? data.index.months : data.index.years;
  if (!entries.length) return null;

  const base = granularity === 'MONTH' ? '/world/ahora/mes' : '/world/ahora/ano';

  return (
    <nav
      className={styles['archive-row']}
      aria-label={`Archivo de ${granularityLabel(granularity)}`}
    >
      {entries.map((entry) => (
        <Link key={entry.periodKey} href={`${base}?period=${entry.periodKey}`}>
          {entry.label}
        </Link>
      ))}
    </nav>
  );
}

export function WorldTemporalView({ data }: { data: WorldTemporalPageData }) {
  if (!data.surface) {
    return (
      <div className={styles.stack}>
        <WorldNavigation showTemporal />
        <Card aria-labelledby="world-temporal-unavailable-title">
          <SectionHeader
            id="world-temporal-unavailable-title"
            title="Ahora no está disponible"
            description="La vista temporal falla cerrado si falta la superficie publicada."
            icon={CircleAlert}
            domain="neutral"
          />
          <div className={styles.notice} data-tone="warning" role="status">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{data.notice ?? 'No hay datos temporales disponibles.'}</span>
          </div>
        </Card>
      </div>
    );
  }

  const period = data.period;
  const coverageCounts = period
    ? period.domains.reduce(
        (acc, domain) => {
          acc[domain.coverageState] += 1;
          return acc;
        },
        { COVERAGE_OK: 0, COVERAGE_PARTIAL: 0, COVERAGE_FAILED: 0 },
      )
    : null;

  return (
    <div className={styles.stack}>
      <WorldNavigation showTemporal />

      <ArchiveLinks data={data} granularity={data.granularity} />

      {data.notice ? (
        <div
          className={styles.notice}
          data-tone={period?.transitionNote ? 'warning' : 'info'}
          role="status"
        >
          <CircleAlert size={16} aria-hidden="true" />
          <span>{data.notice}</span>
        </div>
      ) : null}

      {period ? (
        <>
          <section className={styles['period-hero']} aria-labelledby="world-period-title">
            <div>
              <p className={styles.eyebrow}>
                {granularityLabel(period.granularity)} ·{' '}
                {period.state === 'CLOSED' ? 'Cerrado' : 'En curso'}
              </p>
              <h2 id="world-period-title">{period.label}</h2>
              <p>
                Panorama primero; profundidad solo donde realmente aporta. No es una cola de
                noticias para ponerse al día.
              </p>
            </div>
            {coverageCounts ? (
              <div className={styles['coverage-summary']} aria-label="Estado de cobertura">
                <span>{coverageCounts.COVERAGE_OK} dominios OK</span>
                {coverageCounts.COVERAGE_PARTIAL ? (
                  <span>{coverageCounts.COVERAGE_PARTIAL} parciales</span>
                ) : null}
                {coverageCounts.COVERAGE_FAILED ? (
                  <span>{coverageCounts.COVERAGE_FAILED} sin cobertura</span>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className={styles['domain-stack']}>
            {WORLD_DOMAINS.map((meta) => {
              const domain = period.domains.find((candidate) => candidate.domain === meta.id);
              if (!domain) return null;

              const deepDives = domain.deepDiveBriefIds
                .map((briefId) =>
                  data.surface?.library.items.find((item) => item.briefId === briefId),
                )
                .filter((item): item is WorldPieceSummary => item !== undefined);
              const outcome = outcomeText(domain.outcome);

              return (
                <section
                  key={domain.domain}
                  className={styles['period-domain']}
                  aria-labelledby={`world-period-${domain.domain}`}
                >
                  <div className={styles['period-domain-heading']}>
                    <div>
                      <p className={styles.eyebrow}>Resumen del período</p>
                      <h2 id={`world-period-${domain.domain}`}>{meta.label}</h2>
                    </div>
                    <span className={styles['coverage-pill']} data-state={domain.coverageState}>
                      {coverageLabel(domain.coverageState)}
                    </span>
                  </div>

                  {domain.summaryItems.length ? (
                    <ul className={styles['brief-list']}>
                      {domain.summaryItems.map((item) => (
                        <li key={item.itemId}>
                          <strong>{item.headline}</strong>
                          <p>{item.summary}</p>
                        </li>
                      ))}
                    </ul>
                  ) : outcome ? (
                    <p className={styles['domain-outcome']}>{outcome}</p>
                  ) : null}

                  {deepDives.length ? (
                    <div className={styles['deep-dive-block']}>
                      <div className={styles['subsection-title']}>
                        <Layers3 size={16} aria-hidden="true" />
                        <strong>En profundidad</strong>
                      </div>
                      <div className={styles.grid}>
                        {deepDives.map((item) => (
                          <DeepDiveCard key={item.briefId} item={item} />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {domain.followUps.length ? (
                    <div className={styles['follow-up-block']}>
                      <strong>En seguimiento</strong>
                      <ul>
                        {domain.followUps.map((item) => (
                          <li key={item.storylineId}>
                            <span>{item.label}</span>
                            <small>{item.status}</small>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          <footer className={styles.provenance}>
            <span>
              PAS <code>{period.source.commit.slice(0, 8)}</code> · observado{' '}
              {period.source.observedAt}
            </span>
            <span>
              <CalendarRange size={13} aria-hidden="true" /> {period.window.start} →{' '}
              {period.window.end}
            </span>
          </footer>
        </>
      ) : (
        <Card>
          <SectionHeader
            title={`${granularityLabel(data.granularity)} todavía sin cierre publicado`}
            description={
              data.granularity === 'MONTH' || data.granularity === 'YEAR'
                ? 'Cuando cierre el primer período bajo la Pirámide Temporal aparecerá acá y quedará archivado.'
                : 'El siguiente cierre temporal aparecerá acá automáticamente después de la aprobación editorial.'
            }
            icon={CalendarRange}
            domain="neutral"
          />
        </Card>
      )}
    </div>
  );
}
