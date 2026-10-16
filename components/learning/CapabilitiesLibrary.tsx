'use client';

import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { Card } from '@/components/ui/Card';
import type { CapabilityItem, CapabilityLibraryRead } from '@/lib/learning/capabilities-source';

import {
  CAPABILITY_PAGE_SIZE,
  EMPTY_CAPABILITY_FILTERS,
  activeHoursLabel,
  capabilityExcerpt,
  capabilitySubcategories,
  filterCapabilities,
  subcategoryLabel,
  timeConfidenceLabel,
  type CapabilityFilters,
} from './capabilities-exploration';
import styles from './CapabilitiesLibrary.module.scss';

const AREAS = [
  'Habilidades',
  'Conocimientos',
  'Carácter',
  'Experiencias',
  'Presencia',
  'Recursos',
  'Relaciones',
];

function routeLabel(item: CapabilityItem): string {
  const labels: Record<string, string> = {
    GENERALIST_ONLY: 'Biblioteca generalista',
    PROFESSIONAL: 'Proyecto profesional correspondiente',
    WORLD: 'Proyecto relacionado con el mundo y la vida diaria',
    INTELLIGENCE: 'Proyecto de inteligencia correspondiente',
  };
  const primary = item.primaryRoute
    ? (labels[item.primaryRoute] ?? 'Proyecto correspondiente')
    : 'Sin ruta indicada';
  return item.learningRoute
    ? `${primary}. Si pedís aprenderlo: Learning OS, solo con solicitud explícita.`
    : primary;
}

function CapabilityTimeReference({ item }: { item: CapabilityItem }) {
  const time = item.timeEstimate;
  return (
    <div className={styles['time-reference']}>
      <p>{time.criterion ?? 'Referencia de esfuerzo no disponible.'}</p>
      {time.levelRanges.length ? (
        <>
          <p>Rangos genéricos acumulados desde el nivel 0:</p>
          <ul>
            {time.levelRanges.map((range) => (
              <li key={range.level}>
                Nivel {range.level}: {activeHoursLabel(range)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {time.stateRange ? (
        <p>Para el estado de referencia: {activeHoursLabel(time.stateRange)}.</p>
      ) : null}
      {time.stateLabel ? <p>Estado de referencia: {time.stateLabel}.</p> : null}
      <p>
        {timeConfidenceLabel(item)}. Referencia genérica, no una garantía ni una predicción
        personal. Las horas activas no son tiempo de calendario.
      </p>
    </div>
  );
}

function CapabilityDetails({ item }: { item: CapabilityItem }) {
  if (!item.card) {
    return (
      <div className={styles.discovery}>
        <dl>
          <div>
            <dt>Categoría y subcategoría</dt>
            <dd>
              {item.area} · {subcategoryLabel(item.subcategory)}
            </dd>
          </div>
          <div>
            <dt>Tiempo y esfuerzo</dt>
            <dd>
              <CapabilityTimeReference item={item} />
            </dd>
          </div>
          <div>
            <dt>Ruta si después pedís aprenderla</dt>
            <dd>{routeLabel(item)}</dd>
          </div>
        </dl>
      </div>
    );
  }
  return (
    <div className={styles.details}>
      <h4>Qué te llevás</h4>
      <p className={styles.outcome}>{item.card.whatYouGet}</p>
      <h4>Beneficios concretos</h4>
      <ul>
        {item.card.benefits.map((benefit) => (
          <li key={benefit}>{benefit}</li>
        ))}
      </ul>
      {item.card.relatedBenefits.length ? (
        <>
          <h4>También puede ayudar con</h4>
          <ul>
            {item.card.relatedBenefits.map((benefit) => (
              <li key={`${benefit.area}:${benefit.how}`}>
                <strong>{benefit.area}:</strong> {benefit.how} ({benefit.evidence})
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <dl>
        <div>
          <dt>Cómo se siente alcanzar el nivel</dt>
          <dd>{item.card.targetFeel}</dd>
        </div>
        <div>
          <dt>Cómo suele sentirse aprenderlo</dt>
          <dd>{item.card.learningFeel}</dd>
        </div>
        <div>
          <dt>Dificultad</dt>
          <dd>{item.card.difficulty}</dd>
        </div>
        <div>
          <dt>Fricciones habituales</dt>
          <dd>{item.card.friction}</dd>
        </div>
        <div>
          <dt>Qué hace falta</dt>
          <dd>{item.card.infrastructure}</dd>
        </div>
        <div>
          <dt>Mantenimiento</dt>
          <dd>{item.card.maintenance}</dd>
        </div>
        <div>
          <dt>Tiempo y esfuerzo</dt>
          <dd>
            <CapabilityTimeReference item={item} />
          </dd>
        </div>
        <div>
          <dt>Ruta si después pedís aprenderla</dt>
          <dd>{routeLabel(item)}</dd>
        </div>
      </dl>
      <section className={styles.reassurance}>
        <h4>Si nunca lo aprendés</h4>
        <p>{item.card.ifNeverLearned}</p>
      </section>
    </div>
  );
}

function CapabilityTile({
  item,
  expanded,
  onToggle,
}: {
  item: CapabilityItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tileId = useId();
  const titleId = `${tileId}-title`;
  const detailsId = `${tileId}-details`;
  return (
    <article className={styles.tile} data-expanded={expanded} aria-labelledby={titleId}>
      <div className={styles['tile-header']}>
        <span className={styles.area}>{item.area}</span>
        <span className={styles.badge}>{item.card ? 'Ficha curada' : 'Catálogo'}</span>
      </div>
      <h3 id={titleId}>{item.name}</h3>
      <p className={styles.excerpt}>{capabilityExcerpt(item)}</p>
      <button
        type="button"
        className={styles['detail-toggle']}
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={`${expanded ? 'Cerrar' : 'Ver'} ${item.card ? 'ficha' : 'entrada'}: ${item.name}`}
        onClick={onToggle}
      >
        {expanded ? 'Cerrar' : item.card ? 'Ver ficha' : 'Ver entrada'}
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div id={detailsId} hidden={!expanded}>
        {expanded ? <CapabilityDetails item={item} /> : null}
      </div>
    </article>
  );
}

export function CapabilitiesLibrary({ library }: { library: CapabilityLibraryRead }) {
  const prefix = useId();
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<CapabilityFilters>(EMPTY_CAPABILITY_FILTERS);
  const [browsing, setBrowsing] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const subcategories = useMemo(
    () => capabilitySubcategories(library.items, filters.area),
    [library.items, filters.area],
  );
  const filtered = useMemo(
    () => filterCapabilities(library.items, filters),
    [library.items, filters],
  );
  const featured = library.initialIds
    .map((id) => library.items.find((item) => item.id === id))
    .filter((item): item is CapabilityItem => Boolean(item))
    .slice(0, 3);
  const pageCount = Math.max(1, Math.ceil(filtered.length / CAPABILITY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = browsing
    ? filtered.slice((currentPage - 1) * CAPABILITY_PAGE_SIZE, currentPage * CAPABILITY_PAGE_SIZE)
    : featured;
  const hasFilters = Boolean(
    filters.query || filters.area || filters.subcategory || filters.content !== 'all',
  );

  function changeFilters(next: Partial<CapabilityFilters>) {
    setFilters((current) => ({
      ...current,
      ...next,
      ...('area' in next ? { subcategory: '' } : {}),
    }));
    setBrowsing(true);
    setPage(1);
    setOpenId(null);
  }

  function reset() {
    setFilters(EMPTY_CAPABILITY_FILTERS);
    searchInput.current?.focus();
    setBrowsing(false);
    setPage(1);
    setOpenId(null);
  }

  function changePage(next: number) {
    setPage(next);
    setOpenId(null);
    resultsHeading.current?.focus();
  }

  if (library.status !== 'ready') {
    return (
      <Card>
        <p className={styles.notice} role="status">
          {library.notice}
        </p>
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      <Card aria-labelledby={`${prefix}-heading`}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Biblioteca opcional</span>
          <h2 id={`${prefix}-heading`}>Seguí tu curiosidad</h2>
          <p>Explorá a tu ritmo, sin iniciar un plan de estudio.</p>
        </div>
        <div className={styles.search}>
          <label htmlFor={`${prefix}-search`}>Buscar capacidades</label>
          <div className={styles['search-field']}>
            <Search size={22} aria-hidden="true" />
            <input
              id={`${prefix}-search`}
              ref={searchInput}
              type="search"
              autoComplete="off"
              value={filters.query}
              onChange={(event) => changeFilters({ query: event.target.value })}
              placeholder="Nombre o categoría"
            />
            {filters.query ? (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  changeFilters({ query: '' });
                  searchInput.current?.focus();
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        <fieldset className={styles.categories}>
          <legend>Categorías</legend>
          <div className={styles.chips}>
            {['', ...AREAS].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filters.area === value}
                onClick={() => changeFilters({ area: value })}
              >
                {value || 'Todas'}
              </button>
            ))}
          </div>
        </fieldset>
        <div className={styles.filters}>
          <div className={styles.filter}>
            <label htmlFor={`${prefix}-subcategory`}>Subcategoría</label>
            <select
              id={`${prefix}-subcategory`}
              value={filters.subcategory}
              onChange={(event) => changeFilters({ subcategory: event.target.value })}
            >
              <option value="">Todas las subcategorías</option>
              {subcategories.map((value) => (
                <option key={value} value={value}>
                  {subcategoryLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filter}>
            <label htmlFor={`${prefix}-content`}>Contenido</label>
            <select
              id={`${prefix}-content`}
              value={filters.content}
              onChange={(event) =>
                changeFilters({ content: event.target.value as CapabilityFilters['content'] })
              }
            >
              <option value="all">Todo el contenido</option>
              <option value="curated">Fichas curadas</option>
              <option value="discovery">Entradas de catálogo</option>
            </select>
          </div>
          <button
            type="button"
            className={styles['text-button']}
            disabled={!hasFilters}
            onClick={reset}
          >
            <X size={16} aria-hidden="true" /> Limpiar filtros
          </button>
        </div>
      </Card>

      <section aria-labelledby={`${prefix}-results`} className={styles.results}>
        <div className={styles['results-heading']}>
          <div>
            <h2 id={`${prefix}-results`} ref={resultsHeading} tabIndex={-1}>
              {browsing
                ? hasFilters
                  ? 'Resultados de tu búsqueda'
                  : 'Todo el inventario'
                : 'Tres descubrimientos'}
            </h2>
            <p role="status" aria-atomic="true">
              {browsing
                ? `${filtered.length} resultados · ${visible.length} en esta página`
                : 'Tres posibilidades de áreas distintas, sin orden de prioridad.'}
            </p>
          </div>
          <button
            type="button"
            className={styles['browse-button']}
            onClick={() => {
              if (browsing) reset();
              else {
                setBrowsing(true);
                setOpenId(null);
              }
            }}
          >
            {browsing ? 'Volver a descubrimientos' : 'Explorar todo el inventario'}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.grid}>
          {visible.map((item) => (
            <CapabilityTile
              key={item.id}
              item={item}
              expanded={openId === item.id}
              onToggle={() => setOpenId((current) => (current === item.id ? null : item.id))}
            />
          ))}
        </div>
        {visible.length === 0 ? (
          <Card className={styles.empty}>
            <Search size={28} aria-hidden="true" />
            <h3>No encontramos coincidencias</h3>
            <p>Probá con otro nombre o limpiá los filtros para volver a explorar.</p>
            <button type="button" className={styles['browse-button']} onClick={reset}>
              Limpiar filtros
            </button>
          </Card>
        ) : null}
        {browsing && pageCount > 1 ? (
          <nav className={styles.pagination} aria-label="Páginas de capacidades">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => changePage(currentPage - 1)}
            >
              <ChevronLeft size={18} aria-hidden="true" /> Anterior
            </button>
            <span>
              Página {currentPage} de {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage === pageCount}
              onClick={() => changePage(currentPage + 1)}
            >
              Siguiente <ChevronRight size={18} aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </section>

      <Card compact>
        <p className={styles.provenance}>
          Fuente privada: PAS main
          {library.sourceCommit ? ` · ${library.sourceCommit.slice(0, 12)}` : ''}
          {library.updated ? ` · datos actualizados ${library.updated}` : ''}. Las referencias de
          tiempo son genéricas; no estiman tu tiempo personal.
        </p>
      </Card>
    </div>
  );
}
