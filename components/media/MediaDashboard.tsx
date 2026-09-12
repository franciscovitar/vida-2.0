'use client';

import { Film, Search, SlidersHorizontal, Tv } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ManualFocusControl } from '@/components/media/ManualFocusControl';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { watchPriorityScore } from '@/lib/media/focus';
import {
  countCollection,
  deriveMediaFilterOptions,
  filterMediaTitles,
  sortMediaTitles,
} from '@/lib/media/view';
import type {
  MediaCollectionFilter,
  MediaCommitmentFilter,
  MediaDashboardData,
  MediaFilters,
  MediaKind,
  MediaSort,
  MediaTitleView,
} from '@/types/media';

import styles from './MediaDashboard.module.scss';

const PAGE_SIZE = 60;

const COLLECTIONS: { value: MediaCollectionFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'bank', label: 'Banco' },
  { value: 'radar', label: 'Radar' },
  { value: 'seen', label: 'Vistas / terminadas' },
  { value: 'active', label: 'En curso' },
];

function initialFilters(medium: MediaKind): MediaFilters {
  return {
    medium,
    collection: 'all',
    query: '',
    genre: '',
    country: '',
    creator: '',
    yearFrom: '',
    yearTo: '',
    commitment: 'all',
    sort: 'bank-priority',
  };
}

function score(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function runtimeLabel(item: MediaTitleView): string | null {
  if (item.medium === 'movie') {
    return item.runtimeMinutes === null ? null : `${Math.round(item.runtimeMinutes)} min`;
  }
  const parts: string[] = [];
  if (item.runtimeMinutes !== null) parts.push(`${Math.round(item.runtimeMinutes)} min/ep`);
  if (item.seasons !== null) parts.push(`${item.seasons} temp.`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function commitmentOptions(medium: MediaKind): { value: MediaCommitmentFilter; label: string }[] {
  if (medium === 'movie') {
    return [
      { value: 'all', label: 'Cualquier duración' },
      { value: 'under-90', label: 'Menos de 90 min' },
      { value: '90-119', label: '90–119 min' },
      { value: '120-149', label: '120–149 min' },
      { value: '150-plus', label: '150 min o más' },
    ];
  }
  return [
    { value: 'all', label: 'Cualquier cantidad' },
    { value: 'one-season', label: '1 temporada' },
    { value: 'two-three-seasons', label: '2–3 temporadas' },
    { value: 'four-plus-seasons', label: '4+ temporadas' },
  ];
}

function hasExtraFilters(filters: MediaFilters): boolean {
  return Boolean(
    filters.query ||
    filters.genre ||
    filters.country ||
    filters.creator ||
    filters.yearFrom ||
    filters.yearTo ||
    filters.commitment !== 'all' ||
    filters.collection !== 'all' ||
    filters.sort !== 'bank-priority',
  );
}

function mediumLabel(medium: MediaKind): string {
  return medium === 'movie' ? 'Películas' : 'Series';
}

interface MediaDashboardViewProps {
  data: MediaDashboardData;
}

export function MediaDashboardView({ data }: MediaDashboardViewProps) {
  const firstReadyMedium =
    data.sources.find((source) => source.state === 'ready')?.medium ?? 'movie';
  const [filters, setFilters] = useState<MediaFilters>(() => initialFilters(firstReadyMedium));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const options = useMemo(
    () => deriveMediaFilterOptions(data.titles, filters.medium),
    [data.titles, filters.medium],
  );

  const results = useMemo(
    () => sortMediaTitles(filterMediaTitles(data.titles, filters), filters.sort),
    [data.titles, filters],
  );
  const visible = results.slice(0, visibleCount);

  const totals = useMemo(
    () => ({
      total: data.titles.filter((item) => item.medium === filters.medium).length,
      bank: countCollection(data.titles, filters.medium, 'bank'),
      radar: countCollection(data.titles, filters.medium, 'radar'),
      seen: countCollection(data.titles, filters.medium, 'seen'),
      active: countCollection(data.titles, filters.medium, 'active'),
    }),
    [data.titles, filters.medium],
  );

  function patchFilters(patch: Partial<MediaFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setVisibleCount(PAGE_SIZE);
  }

  function patchYearFrom(yearFrom: string) {
    setFilters((current) => ({
      ...current,
      yearFrom,
      yearTo:
        yearFrom && current.yearTo && Number(yearFrom) > Number(current.yearTo)
          ? yearFrom
          : current.yearTo,
    }));
    setVisibleCount(PAGE_SIZE);
  }

  function patchYearTo(yearTo: string) {
    setFilters((current) => ({
      ...current,
      yearFrom:
        yearTo && current.yearFrom && Number(yearTo) < Number(current.yearFrom)
          ? yearTo
          : current.yearFrom,
      yearTo,
    }));
    setVisibleCount(PAGE_SIZE);
  }

  function switchMedium(medium: MediaKind) {
    setFilters(initialFilters(medium));
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setFilters(initialFilters(filters.medium));
    setVisibleCount(PAGE_SIZE);
  }

  if (data.status === 'unavailable') {
    return (
      <div className={styles.stack}>
        <EmptyState
          icon={Film}
          title="Media no está disponible en este entorno"
          description={data.notice ?? 'No se pudo leer la fuente canónica de Media.'}
          preview={[
            'Películas y series desde el Sheet canónico',
            'Banco, búsqueda y filtros',
            'Notas observadas separadas de scores inferidos',
          ]}
        />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {data.notice ? <p className={styles.notice}>{data.notice}</p> : null}

      <section className={styles.hero} aria-label="Resumen de Media">
        <div className={styles['medium-tabs']} role="tablist" aria-label="Tipo de contenido">
          <button
            type="button"
            role="tab"
            aria-selected={filters.medium === 'movie'}
            className={styles['medium-tab']}
            data-active={filters.medium === 'movie'}
            onClick={() => switchMedium('movie')}
          >
            <Film size={17} aria-hidden="true" />
            Películas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filters.medium === 'series'}
            className={styles['medium-tab']}
            data-active={filters.medium === 'series'}
            onClick={() => switchMedium('series')}
          >
            <Tv size={17} aria-hidden="true" />
            Series
          </button>
        </div>
        <p className={styles['bank-principle']}>
          <strong>Banco = opciones, no pendientes.</strong> Buscá cualquier título por ver y podés
          fijarlo manualmente en un lote.
        </p>
      </section>

      <section className={styles.metrics} aria-label={`Resumen de ${mediumLabel(filters.medium)}`}>
        <button type="button" className={styles.metric} onClick={() => patchFilters({ collection: 'all' })}>
          <span>Total</span>
          <strong>{totals.total}</strong>
        </button>
        <button type="button" className={styles.metric} onClick={() => patchFilters({ collection: 'bank' })}>
          <span>Banco</span>
          <strong>{totals.bank}</strong>
        </button>
        <button type="button" className={styles.metric} onClick={() => patchFilters({ collection: 'seen' })}>
          <span>{filters.medium === 'movie' ? 'Vistas' : 'Terminadas'}</span>
          <strong>{totals.seen}</strong>
        </button>
        <button type="button" className={styles.metric} onClick={() => patchFilters({ collection: 'active' })}>
          <span>En curso</span>
          <strong>{totals.active}</strong>
        </button>
      </section>

      <section className={styles.controls} aria-label="Filtros de Media">
        <div className={styles['collection-tabs']} role="group" aria-label="Colección">
          {COLLECTIONS.map((collection) => (
            <button
              key={collection.value}
              type="button"
              className={styles.chip}
              data-active={filters.collection === collection.value}
              onClick={() => patchFilters({ collection: collection.value })}
            >
              {collection.label}
              {collection.value === 'radar' && totals.radar > 0 ? ` · ${totals.radar}` : ''}
            </button>
          ))}
        </div>

        <label className={styles['search-field']}>
          <Search size={17} aria-hidden="true" />
          <span className={styles['sr-only']}>Buscar</span>
          <input
            type="search"
            value={filters.query}
            placeholder="Buscar título, creador, género o país…"
            onChange={(event) => patchFilters({ query: event.target.value })}
          />
        </label>

        <div className={styles['filter-header']}>
          <span>
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros
          </span>
          {hasExtraFilters(filters) ? (
            <button type="button" className={styles['clear-button']} onClick={clearFilters}>
              Limpiar
            </button>
          ) : null}
        </div>

        <div className={styles['filter-grid']}>
          <label>
            <span>Género</span>
            <select value={filters.genre} onChange={(event) => patchFilters({ genre: event.target.value })}>
              <option value="">Todos</option>
              {options.genres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
            </select>
          </label>
          <label>
            <span>País</span>
            <select value={filters.country} onChange={(event) => patchFilters({ country: event.target.value })}>
              <option value="">Todos</option>
              {options.countries.map((country) => <option key={country} value={country}>{country}</option>)}
            </select>
          </label>
          <label>
            <span>{filters.medium === 'movie' ? 'Director' : 'Creador'}</span>
            <select value={filters.creator} onChange={(event) => patchFilters({ creator: event.target.value })}>
              <option value="">Todos</option>
              {options.creators.map((creator) => <option key={creator} value={creator}>{creator}</option>)}
            </select>
          </label>
          <label>
            <span>Año desde</span>
            <select value={filters.yearFrom} onChange={(event) => patchYearFrom(event.target.value)}>
              <option value="">Cualquiera</option>
              {options.years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label>
            <span>Año hasta</span>
            <select value={filters.yearTo} onChange={(event) => patchYearTo(event.target.value)}>
              <option value="">Cualquiera</option>
              {options.years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label>
            <span>{filters.medium === 'movie' ? 'Duración' : 'Temporadas'}</span>
            <select
              value={filters.commitment}
              onChange={(event) => patchFilters({ commitment: event.target.value as MediaCommitmentFilter })}
            >
              {commitmentOptions(filters.medium).map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Ordenar</span>
            <select value={filters.sort} onChange={(event) => patchFilters({ sort: event.target.value as MediaSort })}>
              <option value="bank-priority">Prioridad del banco</option>
              {options.hasWatchPriority ? <option value="focus-priority">Prioridad de visionado</option> : null}
              <option value="rating-desc">Mi nota</option>
              {options.hasAffinity ? <option value="affinity-desc">Afinidad personal</option> : null}
              {options.hasEstimatedAffinity ? <option value="estimated-affinity-desc">Estimación para vos</option> : null}
              {options.hasCultural ? <option value="cultural-desc">Popularidad / impacto cultural</option> : null}
              {options.hasCinephile ? <option value="cinephile-desc">Valor cinéfilo / culto</option> : null}
              {options.hasScores ? <option value="score-desc">Score general</option> : null}
              <option value="year-desc">Más recientes</option>
              <option value="title">Título A–Z</option>
            </select>
          </label>
        </div>
      </section>

      <div className={styles['result-header']}>
        <div>
          <strong>{results.length}</strong> {results.length === 1 ? 'resultado' : 'resultados'}
          <span> de {totals.total} {mediumLabel(filters.medium).toLocaleLowerCase('es-AR')}</span>
        </div>
        {options.hasWatchPriority ? (
          <span className={styles['score-note']}>La Prioridad de visionado es derivada; tu Lote manual sí se guarda.</span>
        ) : !options.hasScores ? (
          <span className={styles['score-note']}>Scores personales aún no certificados/persistidos.</span>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No hay coincidencias"
          description="Probá quitando uno de los filtros. El Banco no se modifica: esta vista sólo explora la fuente canónica."
          action={<button type="button" className={styles['empty-action']} onClick={clearFilters}>Limpiar filtros</button>}
        />
      ) : (
        <section className={styles.grid} aria-label="Resultados de Media">
          {visible.map((item) => {
            const commitment = runtimeLabel(item);
            const priority = watchPriorityScore(item);
            const hasInference =
              item.affinity !== null ||
              item.estimatedAffinity !== null ||
              item.cinephileValue !== null ||
              item.culturalImpact !== null ||
              item.generalScore !== null;
            const hasExperience = Boolean(item.spoilerFreeSummary || item.whatToExpect);

            return (
              <article key={item.key} className={styles['title-card']}>
                <div className={styles['title-top']}>
                  <div className={styles['title-block']}>
                    <h2>{item.title}</h2>
                    {item.originalTitle && item.originalTitle !== item.title ? (
                      <p className={styles['original-title']}>{item.originalTitle}</p>
                    ) : null}
                  </div>
                  {item.year !== null ? <span className={styles.year}>{item.year}</span> : null}
                </div>

                <div className={styles.badges}>
                  <Badge domain={item.state === 'Por ver' ? 'learning' : 'neutral'}>{item.state}</Badge>
                  {item.manualFocusLevel !== null ? <Badge domain="projects">Fijada · Lote {item.manualFocusLevel}</Badge> : null}
                  {item.bankTier ? <Badge variant="outline">Tier {item.bankTier}</Badge> : null}
                  {item.radar ? <Badge domain="projects">Radar</Badge> : null}
                </div>

                <div className={styles.meta}>
                  {item.creator ? <span>{item.creator}</span> : null}
                  {commitment ? <span>{commitment}</span> : null}
                  {item.countries.length > 0 ? <span>{item.countries.join(', ')}</span> : null}
                </div>

                {item.genres.length > 0 ? (
                  <div className={styles.genres}>
                    {item.genres.map((genre) => <span key={genre}>{genre}</span>)}
                  </div>
                ) : null}

                {hasExperience ? (
                  <div className={styles.experience}>
                    {item.spoilerFreeSummary ? (
                      <div className={styles['experience-block']}>
                        <span className={styles['experience-label']}>Sin spoilers</span>
                        <p>{item.spoilerFreeSummary}</p>
                      </div>
                    ) : null}
                    {item.whatToExpect ? (
                      <div className={styles['experience-block']}>
                        <span className={styles['experience-label']}>Qué esperar</span>
                        <p>{item.whatToExpect}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.scores}>
                  {item.rating !== null ? (
                    <div className={styles['observed-score']}>
                      <span>Mi nota</span>
                      <strong>{score(item.rating)}</strong>
                    </div>
                  ) : null}
                  {priority !== null ? (
                    <div className={styles['observed-score']}>
                      <span>Prioridad de visionado</span>
                      <strong>{score(priority)} / 10</strong>
                    </div>
                  ) : null}
                  {hasInference ? (
                    <div className={styles['inferred-scores']}>
                      {item.affinity !== null ? <span>Afinidad <strong>{score(item.affinity)}</strong></span> : null}
                      {item.estimatedAffinity !== null ? <span>Estimación <strong>{score(item.estimatedAffinity)}</strong></span> : null}
                      {item.cinephileValue !== null ? <span>Cinéfilo <strong>{score(item.cinephileValue)}</strong></span> : null}
                      {item.culturalImpact !== null ? <span>Impacto <strong>{score(item.culturalImpact)}</strong></span> : null}
                      {item.generalScore !== null ? <span>General <strong>{score(item.generalScore)}</strong></span> : null}
                    </div>
                  ) : null}
                </div>

                {item.whyForMe ? (
                  <div className={styles['personal-reference']}>
                    <span>Del estilo de</span>
                    <p>{item.whyForMe}</p>
                  </div>
                ) : null}

                <ManualFocusControl
                  itemKey={item.key}
                  medium={item.medium}
                  state={item.state}
                  value={item.manualFocusLevel}
                />
              </article>
            );
          })}
        </section>
      )}

      {visibleCount < results.length ? (
        <button type="button" className={styles['load-more']} onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}>
          Mostrar {Math.min(PAGE_SIZE, results.length - visibleCount)} más
        </button>
      ) : null}
    </div>
  );
}
