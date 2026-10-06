import { CircleAlert, Info } from 'lucide-react';

import type {
  ProfessionalOfferComparisonGroup,
  ProfessionalOfferVariant,
  ProfessionalOfferVariantsData,
} from '@/types/professional-offers';

import styles from './ProfessionalV2.module.scss';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'free', label: 'Gratis' },
  { id: 'under20', label: '≤ USD 20' },
  { id: 'daily', label: 'Uso frecuente' },
] as const;

function priceLabel(offer: ProfessionalOfferVariant): string {
  if (offer.headlinePriceUsdMonthly === 0) return 'Gratis';
  return `USD ${offer.headlinePriceUsdMonthly}/mes`;
}

function limitProvenanceLabel(value: string): string {
  if (value === 'EXACT_OFFICIAL') return 'límite exacto oficial';
  if (value === 'RELATIVE_EXACT_OFFICIAL') return 'límite relativo oficial';
  if (value === 'QUALITATIVE_OFFICIAL') return 'límite cualitativo oficial';
  if (value === 'QUALITATIVE_PLUS_USAGE_MODEL_OFFICIAL') {
    return 'límite oficial + modelo de consumo';
  }
  return 'provenance oficial';
}

function filterOffers(
  offers: readonly ProfessionalOfferVariant[],
  filter: string,
): ProfessionalOfferVariant[] {
  if (filter === 'free') return offers.filter((offer) => offer.headlinePriceUsdMonthly === 0);
  if (filter === 'under20') {
    return offers.filter((offer) => offer.headlinePriceUsdMonthly <= 20);
  }
  if (filter === 'daily') {
    return offers.filter((offer) =>
      ['REGULAR', 'FREQUENT', 'DAILY_AGENT', 'DAILY_HIGH', 'POWER_USER'].includes(
        offer.sustainedUseFit,
      ),
    );
  }
  return [...offers];
}

function groupHref(
  group: ProfessionalOfferComparisonGroup,
  filter: string,
): string {
  const params = new URLSearchParams();
  params.set('group', group.id);
  if (filter !== 'all') params.set('filter', filter);
  return `/professional/herramientas?${params.toString()}`;
}

function filterHref(groupId: string, filter: string): string {
  const params = new URLSearchParams();
  params.set('group', groupId);
  if (filter !== 'all') params.set('filter', filter);
  return `/professional/herramientas?${params.toString()}`;
}

export function ProfessionalTools({
  data,
  filter = 'all',
  groupId,
}: {
  data: ProfessionalOfferVariantsData;
  filter?: string;
  groupId?: string;
}) {
  if (data.status !== 'ready' || !data.snapshot || data.stale) {
    return (
      <section className={styles.section} aria-labelledby="professional-tools-unavailable">
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span id="professional-tools-unavailable">
            {data.notice ??
              'El comparador no está disponible. Revalidá precio y límites antes de comparar.'}
          </span>
        </div>
      </section>
    );
  }

  const snapshot = data.snapshot;
  const group =
    snapshot.comparisonGroups.find((item) => item.id === groupId) ??
    snapshot.comparisonGroups[0];

  if (!group) {
    return (
      <section className={styles.section}>
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>No hay una categoría comparable disponible.</span>
        </div>
      </section>
    );
  }

  const allowedIds = new Set(group.offerIds);
  const currentOffers = filterOffers(
    snapshot.offers.filter((offer) => allowedIds.has(offer.id)),
    filter,
  );

  return (
    <div className={styles.stack}>
      <section className={styles.hero} aria-labelledby="professional-tools-title">
        <p className={styles.eyebrow}>Comparadores por tarea</p>
        <h2 id="professional-tools-title">{group.label}</h2>
        <p>
          Cada plan compite como una oferta distinta. Precio, cuota, canal y limitaciones pesan
          tanto como la capacidad.
        </p>
      </section>

      <nav className={styles['task-selector']} aria-label="Categorías del comparador">
        {snapshot.comparisonGroups.map((item) => (
          <a
            aria-current={item.id === group.id ? 'page' : undefined}
            href={groupHref(item, filter)}
            key={item.id}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className={styles['comparison-status']} data-status={group.rankingStatus}>
        <Info size={15} aria-hidden="true" />
        <div>
          <strong>
            {group.rankingStatus === 'RANKED'
              ? 'Ranking respaldado por evidencia comparable'
              : 'Comparación sin ranking'}
          </strong>
          <span>{group.rankingReason}</span>
        </div>
      </div>

      <nav className={styles.filters} aria-label="Filtros del comparador">
        {FILTERS.map((item) => (
          <a
            aria-current={filter === item.id ? 'page' : undefined}
            href={filterHref(group.id, item.id)}
            key={item.id}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <section className={styles.section} aria-labelledby="offer-comparison-title">
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>Ofertas actuales</p>
            <h3 id="offer-comparison-title">{group.label}</h3>
          </div>
          <span>{currentOffers.length} opciones</span>
        </div>

        <div className={styles['offer-list']}>
          {currentOffers.map((offer) => (
            <article className={styles.offer} key={offer.id}>
              <div className={styles['offer-head']}>
                <div>
                  <span className={styles.provider}>{offer.provider}</span>
                  <h4>
                    {offer.product} · {offer.plan}
                  </h4>
                </div>
                <strong>{priceLabel(offer)}</strong>
              </div>

              <div className={styles['limit-block']}>
                <span>Límite principal</span>
                <p>{offer.keyLimit}</p>
                <small>
                  {limitProvenanceLabel(offer.limitExactness)} · verificado {offer.lastVerified}
                </small>
              </div>

              <div className={styles['offer-meta']}>
                <span>{offer.channels.join(' · ')}</span>
                <span>{offer.accessClass.toLowerCase().replaceAll('_', ' ')}</span>
              </div>

              <details className={styles.details}>
                <summary>Ver capacidades, restricciones y fuentes</summary>
                <div className={styles['details-body']}>
                  <div>
                    <strong>Incluye</strong>
                    <ul>
                      {offer.included.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Limitado o excluido</strong>
                    <ul>
                      {offer.excludedOrCapped.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Fuentes oficiales</strong>
                    {offer.officialSources.map((url) => (
                      <a href={url} key={url} rel="noreferrer" target="_blank">
                        {new URL(url).hostname}
                      </a>
                    ))}
                  </div>
                </div>
              </details>
            </article>
          ))}
        </div>
      </section>

      <footer className={styles.provenance}>
        PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · planes observados{' '}
        {snapshot.source.observedAt}
      </footer>
    </div>
  );
}
