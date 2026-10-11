import { CircleAlert } from 'lucide-react';

import {
  eligibleToolOffers,
  modelAccessLabel,
  representativeToolOffers,
  resolveToolTask,
  TOOL_TASKS,
  type ToolOfferFilter,
} from '@/lib/professional/tool-task-comparison';
import type {
  ProfessionalOfferVariant,
  ProfessionalOfferVariantsData,
} from '@/types/professional-offers';

import ui from './ProfessionalToolsComparison.module.scss';
import styles from './ProfessionalV2.module.scss';

const FILTERS: readonly { id: ToolOfferFilter; label: string }[] = [
  { id: 'all', label: 'Todos los precios' },
  { id: 'free', label: 'Gratis' },
  { id: 'under20', label: 'Hasta USD 20' },
  { id: 'daily', label: 'Uso frecuente' },
];

const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  APP: 'App',
  CODEX: 'Codex',
  WORK: 'Trabajo asistido',
  CLAUDE_CODE: 'Claude Code',
  IDE: 'IDE',
  CLI: 'CLI',
  CLOUD_AGENT: 'Agente en la nube',
  GITHUB: 'GitHub',
};

const SUSTAINED_USE_LABELS: Readonly<Record<string, string>> = {
  LIGHT_OR_OCCASIONAL: 'ligero u ocasional',
  LIGHT_OR_OCCASIONAL_FOR_CODEX: 'ligero u ocasional en Codex',
  LIGHT_TO_MODERATE_COMPLETION: 'ligero a moderado (autocompletado)',
  REGULAR: 'regular',
  FREQUENT: 'frecuente',
  DAILY_AGENT: 'diario con agentes',
  DAILY_HIGH: 'diario intensivo',
  POWER_USER: 'intensivo',
};

function priceLabel(offer: ProfessionalOfferVariant): string {
  if (offer.headlinePriceUsdMonthly === 0) return 'Gratis';
  return `USD ${offer.headlinePriceUsdMonthly}/mes`;
}

function channelsLabel(offer: ProfessionalOfferVariant): string {
  return offer.channels.map((channel) => CHANNEL_LABELS[channel] ?? channel).join(' · ');
}

function sustainedUseLabel(value: string): string {
  return SUSTAINED_USE_LABELS[value] ?? value.toLowerCase().replaceAll('_', ' ');
}

function limitProvenanceLabel(value: string): string {
  if (value === 'EXACT_OFFICIAL') return 'límite exacto oficial';
  if (value === 'RELATIVE_EXACT_OFFICIAL') return 'límite relativo oficial';
  if (value === 'QUALITATIVE_OFFICIAL') return 'límite cualitativo oficial';
  if (value === 'QUALITATIVE_PLUS_USAGE_MODEL_OFFICIAL') {
    return 'límite oficial + modelo de consumo';
  }
  return 'información oficial del plan';
}

function toolsHref(
  taskId: string,
  filter: ToolOfferFilter,
  groupId: string | null,
  all = false,
): string {
  const params = new URLSearchParams({ task: taskId });
  if (groupId) params.set('group', groupId);
  if (filter !== 'all') params.set('filter', filter);
  if (all) params.set('all', '1');
  return `/professional/herramientas?${params.toString()}`;
}

function OfferRow({ offer }: { offer: ProfessionalOfferVariant }) {
  return (
    <article className={styles.offer}>
      <div className={styles['offer-head']}>
        <div>
          <span className={styles.provider}>{offer.provider}</span>
          <h4>
            {offer.product} · {offer.plan}
          </h4>
        </div>
        <strong>{priceLabel(offer)}</strong>
      </div>
      <p className={ui['model-note']}>
        <strong>Modelos declarados:</strong> {modelAccessLabel(offer)}
      </p>
      <div className={styles['limit-block']}>
        <span>Límite principal</span>
        <p>{offer.keyLimit}</p>
        <small>
          {limitProvenanceLabel(offer.limitExactness)} · verificado {offer.lastVerified}
        </small>
      </div>
      <div className={styles['offer-meta']}>
        <span>Canales: {channelsLabel(offer)}</span>
        <span>Uso sostenido: {sustainedUseLabel(offer.sustainedUseFit)}</span>
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
  );
}

export function ProfessionalTools({
  data,
  filter = 'all',
  taskId,
  groupId,
  showAll = false,
}: {
  data: ProfessionalOfferVariantsData;
  filter?: string;
  taskId?: string;
  groupId?: string;
  showAll?: boolean;
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
  const defaultGroup = snapshot.comparisonGroups[0];
  const group = snapshot.comparisonGroups.find((item) => item.id === groupId) ?? defaultGroup;

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

  // Keep `group` in links only when it differs from the default catalog.
  const linkedGroupId = group.id === defaultGroup?.id ? null : group.id;
  const task = resolveToolTask(taskId);
  const selectedFilter = FILTERS.find((item) => item.id === filter)?.id ?? 'all';
  const currentOffers = eligibleToolOffers(snapshot.offers, group.offerIds, task, selectedFilter);
  const representatives = representativeToolOffers(currentOffers, selectedFilter);
  const displayedOffers = showAll ? currentOffers : representatives;
  const maxPrice = Math.max(0, ...representatives.map((offer) => offer.headlinePriceUsdMonthly));

  return (
    <div className={styles.stack}>
      <header className={ui['task-header']}>
        <p className={styles.eyebrow}>Comparadores por tarea · {group.label}</p>
        <h2>¿Qué IA conviene explorar para cada tarea?</h2>
        <p>
          Elegí la tarea y el presupuesto. Primero aparece un plan de entrada por producto, sin
          ganadores inventados. Modelo, producto, plan y canal se muestran por separado.
        </p>
      </header>

      <nav className={ui['task-nav']} aria-label="Elegir tarea de IA">
        {TOOL_TASKS.map((option) => (
          <a
            aria-current={option.id === task.id ? 'page' : undefined}
            href={toolsHref(option.id, selectedFilter, linkedGroupId)}
            key={option.id}
          >
            {option.label}
          </a>
        ))}
      </nav>
      <p className={ui['offer-intro']}>{task.description}</p>

      <nav className={ui['budget-nav']} aria-label="Filtrar precio y frecuencia">
        {FILTERS.map((option) => (
          <a
            aria-current={selectedFilter === option.id ? 'page' : undefined}
            href={toolsHref(task.id, option.id, linkedGroupId)}
            key={option.id}
          >
            {option.label}
          </a>
        ))}
      </nav>

      <div className={ui.disclaimer} data-status={group.rankingStatus}>
        <strong>
          {group.rankingStatus === 'RANKED'
            ? 'Ranking general del catálogo, no por tarea'
            : 'Comparación sin ranking'}{' '}
          · no hay un mejor modelo verificado para esta tarea
        </strong>
        <span>
          Los precios y límites de los planes están verificados en fuentes oficiales, pero todavía
          no hay evidencia controlada y comparable por tarea para ordenar un número uno. Los
          candidatos se filtran por canales de acceso documentados, no por éxito demostrado. El
          catálogo se recopiló para programación y no cubre todos los modelos, tareas ni APIs. V09
          (calidad por tarea) y V10 (costo por resultado útil) siguen pendientes de evaluaciones
          controladas. Precio bajo no significa más o menos capacidad.
        </span>
      </div>

      <section className={ui['price-panel']} aria-labelledby="tool-price-title">
        <h3 id="tool-price-title">Precio mensual de los planes de entrada</h3>
        <p>
          USD nominales por plan, sin impuestos ni costo de API. Un plan por producto, elegido por
          precio dentro del filtro; el orden es alfabético, no de calidad.
        </p>
        {representatives.length > 0 ? (
          <div className={ui['price-rows']}>
            {representatives.map((offer) => (
              <div className={ui['price-row']} key={offer.id}>
                <div className={ui['price-label']}>
                  <strong>{offer.product}</strong>
                  <span>{offer.plan}</span>
                </div>
                <div
                  aria-label={`${offer.product} ${offer.plan}: ${priceLabel(offer)}. No mide calidad.`}
                  className={ui['price-track']}
                  role="img"
                >
                  <span
                    className={ui['price-fill']}
                    style={{
                      width:
                        (maxPrice > 0 ? (offer.headlinePriceUsdMonthly / maxPrice) * 100 : 0) + '%',
                    }}
                  />
                </div>
                <strong className={ui['price-value']}>{priceLabel(offer)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p>No hay planes con este canal y presupuesto en el catálogo disponible.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="offer-comparison-title">
        <div className={styles['section-heading']}>
          <div>
            <p className={styles.eyebrow}>Modelo · producto · plan · canal</p>
            <h3 id="offer-comparison-title">Alternativas para revisar</h3>
          </div>
          <span>
            {currentOffers.length}{' '}
            {currentOffers.length === 1 ? 'plan compatible' : 'planes compatibles'} por canal
          </span>
        </div>
        <div className={styles['offer-list']}>
          {displayedOffers.map((offer) => (
            <OfferRow key={offer.id} offer={offer} />
          ))}
        </div>
        {currentOffers.length > representatives.length ? (
          <p className={styles.provenance}>
            {showAll ? (
              <a href={toolsHref(task.id, selectedFilter, linkedGroupId)}>
                Volver a un plan por producto
              </a>
            ) : (
              <a href={toolsHref(task.id, selectedFilter, linkedGroupId, true)}>
                Ver los {currentOffers.length} planes compatibles con esta tarea
              </a>
            )}
          </p>
        ) : null}
      </section>

      <details className={ui['full-list']}>
        <summary>Ver el catálogo completo ({snapshot.offers.length} planes)</summary>
        <p className={ui['offer-intro']}>
          Conserva todas las ofertas de la fuente sin presentarlas como aptas para cualquier tarea.
          Los modelos concretos pueden variar dentro de un mismo plan.
        </p>
        <div className={styles['offer-list']}>
          {snapshot.offers.map((offer) => (
            <OfferRow key={offer.id} offer={offer} />
          ))}
        </div>
      </details>

      <footer className={styles.provenance}>
        PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · planes observados{' '}
        {snapshot.source.observedAt}. La selección por tarea es orientativa: no es una evaluación
        personal ni una recomendación de compra.
      </footer>
    </div>
  );
}
