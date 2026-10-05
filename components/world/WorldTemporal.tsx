import { CalendarRange, CircleAlert, Clock3, Layers3 } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { worldDomainLabel, worldPieceHref } from '@/lib/world/contract';
import type {
  WorldCoverageState,
  WorldPieceSummary,
  WorldTemporalGranularity,
  WorldTemporalIndexEntry,
  WorldTemporalPageData,
  WorldTemporalPeriod,
} from '@/types/world-intelligence';

import { WorldNavigation } from './WorldNavigation';
import styles from './World.module.scss';

const MONTH_SHORT: Record<string, string> = {
  enero: 'ene',
  febrero: 'feb',
  marzo: 'mar',
  abril: 'abr',
  mayo: 'may',
  junio: 'jun',
  julio: 'jul',
  agosto: 'ago',
  septiembre: 'sep',
  octubre: 'oct',
  noviembre: 'nov',
  diciembre: 'dic',
};

function minutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function granularityLabel(granularity: WorldTemporalGranularity): string {
  if (granularity === 'DAY') return 'Día';
  if (granularity === 'WEEK') return 'Semana';
  if (granularity === 'MONTH') return 'Mes';
  return 'Año';
}

function periodOrientation(granularity: WorldTemporalGranularity): string {
  if (granularity === 'DAY') return 'Lo que sobrevivió al ruido del último día cerrado.';
  if (granularity === 'WEEK') return 'Las historias y cambios que realmente definieron la semana.';
  if (granularity === 'MONTH') return 'Los hechos y tendencias que vale la pena conservar de este mes.';
  return 'Los acontecimientos y cambios estructurales que ayudan a entender el año.';
}

function coverageLabel(state: WorldCoverageState): string {
  if (state === 'COVERAGE_OK') return 'Cobertura suficiente';
  if (state === 'COVERAGE_PARTIAL') return 'Cobertura parcial';
  return 'Cobertura no disponible';
}

function cleanPeriodLabel(label: string): string {
  return label
    .replace(/\s*·\s*reconstrucción retrospectiva\s*$/i, '')
    .replace(/\s*·\s*transición\s*$/i, '')
    .trim();
}

function isRetrospective(period: WorldTemporalPeriod): boolean {
  return (
    /reconstrucción retrospectiva/i.test(period.label) ||
    /retrospectiva/i.test(period.transitionNote ?? '')
  );
}

function archiveLabel(
  entry: WorldTemporalIndexEntry,
  granularity: WorldTemporalGranularity,
): string {
  if (granularity === 'YEAR') return entry.periodKey;

  if (granularity === 'MONTH') {
    const [year, month] = entry.periodKey.split('-');
    const date = new Date(`${year}-${month}-01T12:00:00Z`);
    return new Intl.DateTimeFormat('es-AR', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
      .format(date)
      .replace('.', '');
  }

  let label = cleanPeriodLabel(entry.label).replace(/\s+de\s+\d{4}$/i, '');
  for (const [month, short] of Object.entries(MONTH_SHORT)) {
    label = label.replace(new RegExp(`\\bde ${month}\\b`, 'gi'), short);
    label = label.replace(new RegExp(`\\b${month}\\b`, 'gi'), short);
  }
  return label;
}

function DeepDiveCard({ item }: { item: WorldPieceSummary }) {
  return (
    <article className={styles['deep-dive-card']}>
      <div className={styles['card-meta']}>
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
    </article>
  );
}

function ArchiveLinks({
  data,
  granularity,
  currentKey,
}: {
  data: WorldTemporalPageData;
  granularity: WorldTemporalGranularity;
  currentKey?: string | null;
}) {
  if (!data.index || granularity === 'DAY') return null;

  const entries =
    granularity === 'WEEK'
      ? data.index.weeks
      : granularity === 'MONTH'
        ? data.index.months
        : data.index.years;
  if (!entries.length) return null;

  const base =
    granularity === 'WEEK'
      ? '/world/ahora/semana'
      : granularity === 'MONTH'
        ? '/world/ahora/mes'
        : '/world/ahora/ano';

  return (
    <nav
      className={styles['archive-row']}
      aria-label={`Archivo de ${granularityLabel(granularity)}`}
    >
      {entries.map((entry) => (
        <Link
          key={entry.periodKey}
          href={`${base}?period=${entry.periodKey}`}
          data-current={entry.periodKey === currentKey ? 'true' : 'false'}
        >
          {archiveLabel(entry, granularity)}
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

  if (!period) {
    return (
      <div className={styles.stack}>
        <WorldNavigation showTemporal />
        <ArchiveLinks data={data} granularity={data.granularity} />
        <section className={styles['empty-edition']} aria-labelledby="world-empty-period-title">
          <p className={styles.eyebrow}>{granularityLabel(data.granularity)}</p>
          <h2 id="world-empty-period-title">Todavía no hay un cierre disponible</h2>
          <p>
            {data.notice ??
              'El próximo período aparecerá automáticamente cuando exista un cierre válido.'}
          </p>
        </section>
      </div>
    );
  }

  const retrospective = isRetrospective(period);
  const materialDomains = period.domains.filter(
    (domain) =>
      domain.summaryItems.length > 0 ||
      domain.deepDiveBriefIds.length > 0 ||
      domain.followUps.length > 0,
  );

  const stories = materialDomains.flatMap((domain) =>
    domain.summaryItems.map((item) => ({ domain: domain.domain, item })),
  );

  const deepDiveIds = Array.from(
    new Set(materialDomains.flatMap((domain) => domain.deepDiveBriefIds)),
  );
  const deepDives = deepDiveIds
    .map((briefId) => data.surface?.library.items.find((item) => item.briefId === briefId))
    .filter((item): item is WorldPieceSummary => item !== undefined);

  const followUps = materialDomains.flatMap((domain) =>
    domain.followUps.map((item) => ({ domain: domain.domain, item })),
  );

  const quietDomains = period.domains.filter(
    (domain) =>
      domain.coverageState === 'COVERAGE_OK' &&
      domain.outcome === 'NO_MATERIAL_CHANGE' &&
      domain.summaryItems.length === 0 &&
      domain.deepDiveBriefIds.length === 0 &&
      domain.followUps.length === 0,
  );

  return (
    <div className={styles.stack}>
      <WorldNavigation showTemporal />

      <ArchiveLinks
        data={data}
        granularity={data.granularity}
        currentKey={period.periodKey}
      />

      <section className={styles['period-hero']} aria-labelledby="world-period-title">
        <div>
          <p className={styles.eyebrow}>
            {granularityLabel(period.granularity)} ·{' '}
            {period.state === 'CLOSED' ? 'Cerrado' : 'Corregido'}
          </p>
          <h2 id="world-period-title">{cleanPeriodLabel(period.label)}</h2>
          <p>{periodOrientation(period.granularity)}</p>
          <div className={styles['period-meta-line']}>
            {retrospective ? <span>Archivo retrospectivo · no exhaustivo</span> : null}
            <span>No genera deuda de lectura</span>
          </div>
        </div>
      </section>

      {stories.length ? (
        <section className={styles['editorial-section']} aria-labelledby="world-period-stories">
          <div className={styles['editorial-section-heading']}>
            <p className={styles.eyebrow}>En breve</p>
            <h3 id="world-period-stories">Lo que importa de este período</h3>
          </div>
          <div className={styles['story-grid']}>
            {stories.map(({ domain, item }) => (
              <article
                key={item.itemId}
                className={styles['story-card']}
                data-domain={domain}
              >
                <span className={styles['story-kicker']}>{worldDomainLabel(domain)}</span>
                <h3>{item.headline}</h3>
                <p>{item.summary}</p>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className={styles['empty-edition']} aria-labelledby="world-empty-material-title">
          <p className={styles.eyebrow}>Cierre editorial</p>
          <h2 id="world-empty-material-title">Sin historias materiales para destacar</h2>
          <p>
            El período puede seguir siendo válido aunque nada haya superado el umbral editorial.
          </p>
        </section>
      )}

      {deepDives.length ? (
        <section className={styles['editorial-section']} aria-labelledby="world-deep-dives-title">
          <div className={styles['editorial-section-heading']}>
            <div className={styles['subsection-title']}>
              <Layers3 size={16} aria-hidden="true" />
              <p className={styles.eyebrow}>Profundidad selectiva</p>
            </div>
            <h3 id="world-deep-dives-title">Para entender mejor</h3>
          </div>
          <div className={styles['deep-dive-grid']}>
            {deepDives.map((item) => (
              <DeepDiveCard key={item.briefId} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {followUps.length ? (
        <section className={styles['editorial-section']} aria-labelledby="world-followup-title">
          <div className={styles['editorial-section-heading']}>
            <p className={styles.eyebrow}>Historia abierta</p>
            <h3 id="world-followup-title">En seguimiento</h3>
          </div>
          <ul className={styles['editorial-followups']}>
            {followUps.map(({ domain, item }) => (
              <li key={item.storylineId}>
                <span>
                  <small>{worldDomainLabel(domain)}</small>
                  {item.label}
                </span>
                <strong>{item.status}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {quietDomains.length ? (
        <p className={styles['quiet-domains']}>
          Sin cambios materiales:{' '}
          {quietDomains.map((domain) => worldDomainLabel(domain.domain)).join(', ')}.
        </p>
      ) : null}

      <details className={styles['edition-details']}>
        <summary>Sobre esta edición</summary>
        <div className={styles['edition-details-body']}>
          {retrospective ? (
            <p>
              Este archivo fue reconstruido después del período. Conserva solo información
              verificable disponible y no pretende simular una cobertura observada en tiempo real.
            </p>
          ) : data.notice ? (
            <p>{data.notice}</p>
          ) : null}

          <div>
            <strong>Cobertura por dominio</strong>
            <ul className={styles['coverage-list']}>
              {period.domains.map((domain) => (
                <li key={domain.domain} data-state={domain.coverageState}>
                  <span>{worldDomainLabel(domain.domain)}</span>
                  <small>{coverageLabel(domain.coverageState)}</small>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.provenance}>
            <span>
              PAS <code>{period.source.commit.slice(0, 8)}</code> · observado{' '}
              {period.source.observedAt}
            </span>
            <span>
              <CalendarRange size={13} aria-hidden="true" /> {period.window.start} →{' '}
              {period.window.end}
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
