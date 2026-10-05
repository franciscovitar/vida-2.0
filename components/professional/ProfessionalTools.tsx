import { CircleAlert, Info } from 'lucide-react';

import type {
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

export function ProfessionalTools({
  data,
  filter = 'all',
}: {
  data: ProfessionalOfferVariantsData;
  filter?: string;
}) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.section}>
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{data.notice ?? 'Comparador no disponible.'}</span>
        </div>
      </section>
    );
  }

  const snapshot = data.snapshot;
  const group = snapshot.comparisonGroups[0];
  const allowedIds = new Set(group?.offerIds ?? []);
  const currentOffers = filterOffers(
    snapshot.offers.filter((offer) => allowedIds.has(offer.id)),
    filter,
  );

  return (
    <div className={styles.stack}>
      {data.notice ? (
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{data.notice}</span>
        </div>
      ) : null}

      <section className={styles.hero} aria-labelledby="professional-tools-title">
        <p className={styles.eyebrow}>Comparadores vivos</p>
        <h2 id="professional-tools-title">IA para programar</h2>
        <p>
          Cada plan compite como una opción distinta. Precio, cuota y limitaciones pesan tanto como
          la capacidad.
        </p>
        <div className={styles['hero-note']}>
          <Info size={15} aria-hidden="true" />
          <span>
            Todavía no publico un #1 universal: primero necesitamos evidencia comparable suficiente
            por tarea. La matriz de planes y límites sí está verificada.
          </span>
        </div>
      </section>

      <nav className={styles.filters} aria-label="Filtros del comparador">
        {FILTERS.map((item) => (
          <a
            aria-current={filter === item.id ? 'page' : undefined}
            href={
              item.id === 'all'
                ? '/professional/herramientas'
                : `/professional/herramientas?filter=${item.id}`
            }
            key={item.id}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <section className={styles.section} aria-labelledby="offer-comparison-title">
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>Planes individuales</p>
            <h3 id="offer-comparison-title">{group?.label ?? 'Comparación actual'}</h3>
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
              </div>

              <div className={styles['offer-meta']}>
                <span>{offer.channels.join(' · ')}</span>
                <span>verificado {offer.lastVerified}</span>
              </div>

              <details className={styles.details}>
                <summary>Ver capacidades y restricciones</summary>
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
