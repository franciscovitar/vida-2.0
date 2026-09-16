'use client';

import { Film, Search, SlidersHorizontal, Tv } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ManualFocusControl } from '@/components/media/ManualFocusControl';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { MediaCountryFlags } from '@/components/media/MediaCountryFlags';
import { MediaPoster } from '@/components/media/MediaPoster';
import { MediaSortControl } from '@/components/media/MediaSortControl';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  MEDIA_OBLIGATION_OPTIONS,
  cinephileObligationFor,
  obligationLabel,
} from '@/lib/media/cinephile-canon';
import { watchPriorityScore } from '@/lib/media/focus';
import { formatExternalMediaScore } from '@/lib/media/score-format';
import { nextSeasonFor, seasonWatchPriorityScore } from '@/lib/media/seasons';
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
  MediaObligationFilter,
  MediaTitleView,
} from '@/types/media';

import styles from './MediaDashboard.module.scss';

const PAGE_SIZE = 60;
const EXTERNAL_AVERAGE_CONCURRENCY = 4;

type ExternalAverageFilter = '' | '6' | '7' | '8' | '9';
type ExternalAverageEntry =
  { status: 'ready'; average: number } | { status: 'empty' } | { status: 'unavailable' };

const externalAverageSessionCache = new Map<string, ExternalAverageEntry>();

const COLLECTIONS: { value: MediaCollectionFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'bank', label: 'Banco' },
  { value: 'rewatch', label: 'Reveer' },
  { value: 'radar', label: 'Radar' },
  { value: 'seen', label: 'Vistas / terminadas' },
  { value: 'active', label: 'En curso' },
];

async function loadExternalAverage(
  itemKey: string,
  signal: AbortSignal,
): Promise<ExternalAverageEntry | null> {
  try {
    const response = await fetch(`/api/media/external-ratings?key=${encodeURIComponent(itemKey)}`, {
      method: 'GET',
      signal,
      cache: 'no-store',
    });
    if (signal.aborted) return null;
    if (!response.ok) return { status: 'unavailable' };

    const payload = (await response.json()) as {
      ok?: boolean;
      data?: { average?: number | null };
    };
    if (!payload.ok || !payload.data) return { status: 'unavailable' };
    const average = payload.data.average;
    if (typeof average === 'number' && Number.isFinite(average)) {
      return { status: 'ready', average };
    }
    return { status: 'empty' };
  } catch (error: unknown) {
    if (signal.aborted) return null;
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    return { status: 'unavailable' };
  }
}

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
    obligation: 'all',
    sort: 'bank-priority',
  };
}

function score(value: number | null): string {
  return value === null
    ? '—'
    : value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function hasExtraFilters(
  filters: MediaFilters,
  externalAverageMin: ExternalAverageFilter,
): boolean {
  return Boolean(
    filters.query ||
    filters.genre ||
    filters.country ||
    filters.creator ||
    filters.yearFrom ||
    filters.yearTo ||
    filters.commitment !== 'all' ||
    (filters.obligation ?? 'all') !== 'all' ||
    filters.collection !== 'all' ||
    filters.sort !== 'bank-priority' ||
    externalAverageMin,
  );
}

function mediumLabel(medium: MediaKind): string {
  return medium === 'movie' ? 'Películas' : 'Series';
}

interface MediaDashboardViewProps {
  data: MediaDashboardData;
  initialMedium?: MediaKind;
}

export function MediaDashboardView({ data, initialMedium }: MediaDashboardViewProps) {
  const firstReadyMedium =
    data.sources.find((source) => source.state === 'ready')?.medium ?? 'movie';
  const [filters, setFilters] = useState<MediaFilters>(() =>
    initialFilters(initialMedium ?? firstReadyMedium),
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedItem, setSelectedItem] = useState<MediaTitleView | null>(null);
  const [externalAverageMin, setExternalAverageMin] = useState<ExternalAverageFilter>('');
  const [externalAverageEntries, setExternalAverageEntries] = useState<
    Record<string, ExternalAverageEntry>
  >(() => Object.fromEntries(externalAverageSessionCache));

  const options = useMemo(
    () => deriveMediaFilterOptions(data.titles, filters.medium),
    [data.titles, filters.medium],
  );
  const baseResults = useMemo(
    () => sortMediaTitles(filterMediaTitles(data.titles, filters), filters.sort),
    [data.titles, filters],
  );

  useEffect(() => {
    if (!externalAverageMin) return undefined;

    const missing = baseResults.filter((item) => !externalAverageSessionCache.has(item.key));
    if (missing.length === 0) return undefined;

    const controller = new AbortController();
    let cursor = 0;

    async function worker() {
      while (!controller.signal.aborted) {
        const index = cursor;
        cursor += 1;
        const item = missing[index];
        if (!item) return;

        const entry = await loadExternalAverage(item.key, controller.signal);
        if (!entry || controller.signal.aborted) return;

        externalAverageSessionCache.set(item.key, entry);
        setExternalAverageEntries((current) => ({ ...current, [item.key]: entry }));
      }
    }

    void Promise.all(
      Array.from({ length: Math.min(EXTERNAL_AVERAGE_CONCURRENCY, missing.length) }, () =>
        worker(),
      ),
    );

    return () => controller.abort();
  }, [baseResults, externalAverageMin]);

  const results = externalAverageMin
    ? baseResults.filter((item) => {
        const entry = externalAverageEntries[item.key];
        return entry?.status === 'ready' && entry.average >= Number(externalAverageMin);
      })
    : baseResults;
  const visible = results.slice(0, visibleCount);
  const externalLoadedCount = externalAverageMin
    ? baseResults.reduce(
        (count, item) => count + Number(externalAverageEntries[item.key] !== undefined),
        0,
      )
    : 0;
  const externalUnavailableCount = externalAverageMin
    ? baseResults.reduce(
        (count, item) => count + Number(externalAverageEntries[item.key]?.status === 'unavailable'),
        0,
      )
    : 0;
  const externalFilterLoading = Boolean(
    externalAverageMin && externalLoadedCount < baseResults.length,
  );
  const totals = useMemo(
    () => ({
      total: data.titles.filter((item) => item.medium === filters.medium).length,
      bank: countCollection(data.titles, filters.medium, 'bank'),
      rewatch: countCollection(data.titles, filters.medium, 'rewatch'),
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

  function patchExternalAverageMin(value: ExternalAverageFilter) {
    setExternalAverageMin(value);
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
    setExternalAverageMin('');
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setFilters(initialFilters(filters.medium));
    setExternalAverageMin('');
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
            <Film size={17} aria-hidden="true" /> Películas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filters.medium === 'series'}
            className={styles['medium-tab']}
            data-active={filters.medium === 'series'}
            onClick={() => switchMedium('series')}
          >
            <Tv size={17} aria-hidden="true" /> Series
          </button>
        </div>
        <p className={styles['bank-principle']}>
          <strong>Banco = opciones, no pendientes.</strong> Incluye lo que todavía no viste y lo que
          marcaste Reveer. Afinidad para mí y Mi nota se muestran separadas para no mezclar una
          estimación personal con tu evaluación observada.
        </p>
      </section>

      <section className={styles.metrics} aria-label={`Resumen de ${mediumLabel(filters.medium)}`}>
        {[
          ['all', 'Total', totals.total],
          ['bank', 'Banco', totals.bank],
          ['seen', filters.medium === 'movie' ? 'Vistas' : 'Terminadas', totals.seen],
          ['active', 'En curso', totals.active],
        ].map(([collection, label, value]) => (
          <button
            key={String(collection)}
            type="button"
            className={styles.metric}
            onClick={() => patchFilters({ collection: collection as MediaCollectionFilter })}
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        ))}
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
              {collection.value === 'rewatch' && totals.rewatch > 0 ? ` · ${totals.rewatch}` : ''}
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
            <SlidersHorizontal size={16} aria-hidden="true" /> Filtros
          </span>
          {hasExtraFilters(filters, externalAverageMin) ? (
            <button type="button" className={styles['clear-button']} onClick={clearFilters}>
              Limpiar
            </button>
          ) : null}
        </div>

        <div className={styles['filter-grid']}>
          <label>
            <span>Género</span>
            <select
              value={filters.genre}
              onChange={(event) => patchFilters({ genre: event.target.value })}
            >
              <option value="">Todos</option>
              {options.genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>País</span>
            <select
              value={filters.country}
              onChange={(event) => patchFilters({ country: event.target.value })}
            >
              <option value="">Todos</option>
              {options.countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{filters.medium === 'movie' ? 'Director' : 'Creador'}</span>
            <select
              value={filters.creator}
              onChange={(event) => patchFilters({ creator: event.target.value })}
            >
              <option value="">Todos</option>
              {options.creators.map((creator) => (
                <option key={creator} value={creator}>
                  {creator}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Año desde</span>
            <select
              value={filters.yearFrom}
              onChange={(event) => patchYearFrom(event.target.value)}
            >
              <option value="">Cualquiera</option>
              {options.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Año hasta</span>
            <select value={filters.yearTo} onChange={(event) => patchYearTo(event.target.value)}>
              <option value="">Cualquiera</option>
              {options.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{filters.medium === 'movie' ? 'Duración' : 'Temporadas'}</span>
            <select
              value={filters.commitment}
              onChange={(event) =>
                patchFilters({ commitment: event.target.value as MediaCommitmentFilter })
              }
            >
              {commitmentOptions(filters.medium).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Camino cinéfilo</span>
            <select
              value={filters.obligation ?? 'all'}
              onChange={(event) =>
                patchFilters({ obligation: event.target.value as MediaObligationFilter })
              }
            >
              <option value="all">Todas las categorías</option>
              {MEDIA_OBLIGATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Promedio externo</span>
            <select
              value={externalAverageMin}
              onChange={(event) =>
                patchExternalAverageMin(event.target.value as ExternalAverageFilter)
              }
            >
              <option value="">Todos</option>
              <option value="9">9+</option>
              <option value="8">8+</option>
              <option value="7">7+</option>
              <option value="6">6+</option>
            </select>
          </label>
          <MediaSortControl
            value={filters.sort}
            options={options}
            includeBankPriority
            showRating
            onChange={(sort) => patchFilters({ sort })}
          />
        </div>
      </section>

      <div className={styles['result-header']}>
        <div>
          <strong>{results.length}</strong> {results.length === 1 ? 'resultado' : 'resultados'}{' '}
          <span>
            de {totals.total} {mediumLabel(filters.medium).toLocaleLowerCase('es-AR')}
          </span>
        </div>
        {externalAverageMin ? (
          <span className={styles['score-note']}>
            {externalFilterLoading
              ? `Consultando promedios externos ${externalLoadedCount}/${baseResults.length}…`
              : externalUnavailableCount > 0
                ? `Promedio externo listo · ${externalUnavailableCount} sin datos disponibles`
                : 'Promedio externo listo'}
          </span>
        ) : options.hasWatchPriority ? (
          <span className={styles['score-note']}>
            Prioridad de visionado = 50% Afinidad para mí + 30% valor cinéfilo + 20% presencia
            cultural.
          </span>
        ) : null}
      </div>

      {visible.length === 0 && externalFilterLoading ? (
        <p className={styles.notice}>Cargando notas externas para aplicar el filtro…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No hay coincidencias"
          description="Probá quitando uno de los filtros. El Banco no se modifica: esta vista sólo explora la fuente canónica."
          action={
            <button type="button" className={styles['empty-action']} onClick={clearFilters}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <section className={styles.grid} aria-label="Resultados de Media">
          {visible.map((item) => {
            const commitment = runtimeLabel(item);
            const priority = watchPriorityScore(item);
            const obligation = cinephileObligationFor(item);
            return (
              <article
                key={item.key}
                className={styles['title-card']}
                role="button"
                tabIndex={0}
                aria-label={`Ver detalles de ${item.title}`}
                onClick={() => setSelectedItem(item)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedItem(item);
                  }
                }}
              >
                <MediaPoster title={item.title} posterPath={item.posterPath} />
                <div className={styles['card-content']}>
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
                    <Badge
                      domain={
                        item.state === 'Por ver' || item.state === 'Reveer' ? 'learning' : 'neutral'
                      }
                    >
                      {item.state}
                    </Badge>
                    <Badge variant="outline">Camino · {obligationLabel(obligation)}</Badge>
                    {item.manualFocusExcluded ? (
                      <Badge variant="outline">Excluida de lotes</Badge>
                    ) : null}
                    {item.manualFocusLevel !== null ? (
                      <Badge domain="projects">Fijada · Lote {item.manualFocusLevel}</Badge>
                    ) : null}
                    {item.radar ? <Badge domain="projects">Radar</Badge> : null}
                  </div>

                  <div className={styles.meta}>
                    {item.creator ? <span>{item.creator}</span> : null}
                    {commitment ? <span>{commitment}</span> : null}
                    <MediaCountryFlags countries={item.countries} />
                  </div>
                  <div className={styles.genres}>
                    {item.genres.slice(0, 2).map((genre) => (
                      <span key={genre}>{genre}</span>
                    ))}
                  </div>
                  <div className={styles['age-feel-slot']}>
                    {item.ageFeelLabel ? (
                      <p
                        className={styles['age-feel']}
                        title="Señal derivada de año y perfil de experiencia; no es una valoración objetiva."
                      >
                        {item.ageFeelLabel}
                      </p>
                    ) : null}
                  </div>

                  {item.medium === 'series' && item.nextSeasonNumber !== null ? (
                    <div className={styles['next-season-callout']}>
                      <span>Siguiente</span>
                      <strong>Temporada {item.nextSeasonNumber}</strong>
                      {seasonWatchPriorityScore(nextSeasonFor(item)) !== null ? (
                        <small>
                          Prioridad {score(seasonWatchPriorityScore(nextSeasonFor(item)))}
                        </small>
                      ) : null}
                    </div>
                  ) : null}

                  {priority !== null || item.estimatedAffinity !== null ? (
                    <div className={styles['primary-scores']} aria-label="Señales principales">
                      {priority !== null ? (
                        <div className={styles['primary-score']}>
                          <span>Prioridad de visionado</span>
                          <strong>{score(priority)}</strong>
                        </div>
                      ) : null}
                      {item.estimatedAffinity !== null ? (
                        <div className={styles['primary-score']}>
                          <span>Afinidad para mí</span>
                          <strong>{score(item.estimatedAffinity)}</strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {item.rating !== null ? (
                    <div className={styles['season-observed']} aria-label="Mi nota observada">
                      <span>{item.medium === 'series' ? 'Mi nota general' : 'Mi nota'}</span>
                      <strong>{score(item.rating)}</strong>
                    </div>
                  ) : null}

                  {item.cinephileValue !== null || item.culturalImpact !== null ? (
                    <div className={styles['inferred-scores']}>
                      {item.cinephileValue !== null ? (
                        <span>
                          Cinéfilo{' '}
                          <strong>
                            {formatExternalMediaScore(item.cinephileValue, item.scoreVersion)}
                          </strong>
                        </span>
                      ) : null}
                      {item.culturalImpact !== null ? (
                        <span>
                          Presencia cultural{' '}
                          <strong>
                            {formatExternalMediaScore(item.culturalImpact, item.scoreVersion)}
                          </strong>
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <ManualFocusControl
                    itemKey={item.key}
                    medium={item.medium}
                    state={item.state}
                    value={item.manualFocusLevel}
                    excluded={item.manualFocusExcluded}
                  />
                </div>
              </article>
            );
          })}
        </section>
      )}

      <MediaDetailDialog item={selectedItem} onClose={() => setSelectedItem(null)} />

      {visibleCount < results.length ? (
        <button
          type="button"
          className={styles['load-more']}
          onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
        >
          Mostrar {Math.min(PAGE_SIZE, results.length - visibleCount)} más
        </button>
      ) : null}
      <section className={styles.attribution} aria-label="Créditos de datos e imágenes">
        <a
          className={styles['tmdb-logo']}
          href="https://www.themoviedb.org"
          target="_blank"
          rel="noreferrer"
          aria-label="TMDB"
        />
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </section>
    </div>
  );
}
