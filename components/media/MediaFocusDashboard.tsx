'use client';

import { Film, Search, SlidersHorizontal, Tv } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ManualFocusControl } from '@/components/media/ManualFocusControl';
import { MediaDashboardView } from '@/components/media/MediaDashboard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  deriveFocusCandidates,
  deriveFocusTitles,
  focusLimit,
  watchPriorityScore,
} from '@/lib/media/focus';
import { deriveMediaFilterOptions, filterMediaTitles, sortMediaTitles } from '@/lib/media/view';
import type {
  MediaCommitmentFilter,
  MediaDashboardData,
  MediaFilters,
  MediaFocusLevel,
  MediaKind,
  MediaSort,
  MediaTitleView,
} from '@/types/media';

import styles from './MediaDashboard.module.scss';

const FOCUS_LEVELS: MediaFocusLevel[] = [1, 2, 3];

function initialFocusFilters(medium: MediaKind): MediaFilters {
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
    sort: 'focus-priority',
  };
}

function score(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function commitmentLabel(item: MediaTitleView): string | null {
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
    filters.sort !== 'focus-priority',
  );
}

function levelPurpose(level: MediaFocusLevel): string {
  if (level === 1) return 'decidir rápido';
  if (level === 2) return 'más variedad';
  return 'explorar tranquilo';
}

interface MediaFocusDashboardProps {
  data: MediaDashboardData;
}

export function MediaFocusDashboard({ data }: MediaFocusDashboardProps) {
  const firstReadyMedium =
    data.sources.find((source) => source.state === 'ready')?.medium ?? 'movie';
  const [filters, setFilters] = useState<MediaFilters>(() => initialFocusFilters(firstReadyMedium));
  const [level, setLevel] = useState<MediaFocusLevel>(1);
  const [exploring, setExploring] = useState(false);

  const candidateUniverse = useMemo(
    () => deriveFocusCandidates(data.titles, filters.medium),
    [data.titles, filters.medium],
  );
  const options = useMemo(
    () => deriveMediaFilterOptions(candidateUniverse, filters.medium),
    [candidateUniverse, filters.medium],
  );
  const filteredCandidates = useMemo(
    () => filterMediaTitles(candidateUniverse, filters),
    [candidateUniverse, filters],
  );
  const focusByLevel = useMemo(
    () =>
      new Map(
        FOCUS_LEVELS.map((focusLevel) => [
          focusLevel,
          deriveFocusTitles(filteredCandidates, filters.medium, focusLevel),
        ]),
      ),
    [filteredCandidates, filters.medium],
  );
  const focusUniverse = useMemo(() => focusByLevel.get(level) ?? [], [focusByLevel, level]);
  const focus = useMemo(
    () => sortMediaTitles(focusUniverse, filters.sort),
    [focusUniverse, filters.sort],
  );
  const firstFocusKey = focusUniverse[0]?.key ?? null;

  function patchFilters(patch: Partial<MediaFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
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
  }

  function switchMedium(next: MediaKind) {
    setFilters(initialFocusFilters(next));
    setLevel(1);
  }

  function clearFilters() {
    setFilters(initialFocusFilters(filters.medium));
  }

  if (data.status === 'unavailable') {
    return <MediaDashboardView data={data} />;
  }

  if (exploring) {
    return (
      <div className={styles.stack}>
        <section className={styles.hero} aria-label="Explorador completo">
          <p className={styles['bank-principle']}>
            <strong>Estás explorando el Banco completo.</strong> Buscá cualquier título por ver y
            marcá tu prioridad manual cuando quieras forzarlo a un lote.
          </p>
          <div>
            <button
              type="button"
              className={styles['empty-action']}
              onClick={() => setExploring(false)}
            >
              Volver a lotes
            </button>
          </div>
        </section>
        <MediaDashboardView data={data} />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {data.notice ? <p className={styles.notice}>{data.notice}</p> : null}

      <section className={styles.hero} aria-label="Lotes de Media">
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
          <strong>Los lotes se recalculan con tus filtros.</strong> Primero definís el universo y
          después entran las mejores opciones por Prioridad de visionado; cada nivel contiene al
          anterior.
        </p>

        <div className={styles['collection-tabs']} role="group" aria-label="Nivel de lote">
          {FOCUS_LEVELS.map((focusLevel) => {
            const count = focusByLevel.get(focusLevel)?.length ?? 0;
            return (
              <button
                key={focusLevel}
                type="button"
                className={styles.chip}
                data-active={level === focusLevel}
                aria-pressed={level === focusLevel}
                onClick={() => setLevel(focusLevel)}
              >
                Lote {focusLevel} · {count}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.controls} aria-label="Filtros del lote">
        <label className={styles['search-field']}>
          <Search size={17} aria-hidden="true" />
          <span className={styles['sr-only']}>Buscar y recalcular lote</span>
          <input
            type="search"
            value={filters.query}
            placeholder="Buscar y recalcular lote…"
            onChange={(event) => patchFilters({ query: event.target.value })}
          />
        </label>

        <div className={styles['filter-header']}>
          <span>
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filtros que recalculan Lote {level}
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
            <span>Ordenar visualmente</span>
            <select
              value={filters.sort}
              onChange={(event) => patchFilters({ sort: event.target.value as MediaSort })}
            >
              <option value="focus-priority">Prioridad de visionado</option>
              {options.hasEstimatedAffinity ? (
                <option value="estimated-affinity-desc">Estimación para vos</option>
              ) : null}
              {options.hasCinephile ? <option value="cinephile-desc">Valor cinéfilo</option> : null}
              {options.hasCultural ? <option value="cultural-desc">Impacto cultural</option> : null}
              <option value="year-desc">Más recientes</option>
              <option value="title">Título A–Z</option>
            </select>
          </label>
        </div>
      </section>

      <div className={styles['result-header']}>
        <div>
          <strong>{focus.length}</strong> {focus.length === 1 ? 'resultado' : 'resultados'}
          <span>
            {' '}
            · top de {filteredCandidates.length} coincidencias · Lote {level} · {levelPurpose(level)}
            {' '}· objetivo {focusLimit(filters.medium, level)}
          </span>
        </div>
        <span className={styles['score-note']}>
          Prioridad de visionado = 55% afinidad estimada + 25% valor cinéfilo + 20% impacto
          cultural; si falta una dimensión, se renormaliza. Tu prioridad manual prevalece sobre el
          corte, no sobre los filtros.
        </span>
      </div>

      {focus.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No hay coincidencias para este lote"
          description="Probá quitando un filtro. Al cambiar el universo, el lote se vuelve a calcular automáticamente."
          action={
            <button type="button" className={styles['empty-action']} onClick={clearFilters}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <section className={styles.grid} aria-label={`Lote ${level}`}>
          {focus.map((item) => {
            const commitment = commitmentLabel(item);
            const guidance = item.whatToExpect ?? item.spoilerFreeSummary;
            const priority = watchPriorityScore(item);

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
                  {item.key === firstFocusKey ? (
                    <Badge domain="projects">Primera del lote</Badge>
                  ) : null}
                  {item.manualFocusLevel !== null ? (
                    <Badge domain="projects">Fijada · Lote {item.manualFocusLevel}</Badge>
                  ) : null}
                  {item.radar ? <Badge domain="projects">Radar</Badge> : null}
                  {item.bankTier ? <Badge variant="outline">Tier {item.bankTier}</Badge> : null}
                </div>

                <div className={styles.meta}>
                  {item.creator ? <span>{item.creator}</span> : null}
                  {commitment ? <span>{commitment}</span> : null}
                  {item.countries.length > 0 ? <span>{item.countries.join(', ')}</span> : null}
                </div>

                {item.genres.length > 0 ? (
                  <div className={styles.genres}>
                    {item.genres.slice(0, 3).map((genre) => (
                      <span key={genre}>{genre}</span>
                    ))}
                  </div>
                ) : null}

                {guidance ? (
                  <div className={styles.experience}>
                    <div className={styles['experience-block']}>
                      <span className={styles['experience-label']}>Para elegir</span>
                      <p>{guidance}</p>
                    </div>
                  </div>
                ) : null}

                {priority !== null ||
                item.estimatedAffinity !== null ||
                item.cinephileValue !== null ||
                item.culturalImpact !== null ? (
                  <div className={styles.scores}>
                    {priority !== null ? (
                      <div className={styles['observed-score']}>
                        <span>Prioridad de visionado</span>
                        <strong>{score(priority)} / 10</strong>
                      </div>
                    ) : null}
                    <div className={styles['inferred-scores']}>
                      {item.estimatedAffinity !== null ? (
                        <span>
                          Estimación para vos <strong>{score(item.estimatedAffinity)} / 10</strong>{' '}
                          <small>(provisional)</small>
                        </span>
                      ) : null}
                      {item.cinephileValue !== null ? (
                        <span>
                          Cinéfilo <strong>{score(item.cinephileValue)}</strong>
                        </span>
                      ) : null}
                      {item.culturalImpact !== null ? (
                        <span>
                          Impacto <strong>{score(item.culturalImpact)}</strong>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <ManualFocusControl
                  itemKey={item.key}
                  medium={item.medium}
                  state={item.state}
                  value={item.manualFocusLevel}
                  defaultLevel={level}
                />
              </article>
            );
          })}
        </section>
      )}

      <section className={styles.controls} aria-label="Banco completo">
        <p className={styles['bank-principle']}>
          ¿Querés forzar una opción que no apareció? Buscala en el Banco completo y marcala como
          prioritaria para elegir su lote.
        </p>
        <div>
          <button
            type="button"
            className={styles['empty-action']}
            onClick={() => setExploring(true)}
          >
            Explorar Banco completo
          </button>
        </div>
      </section>
    </div>
  );
}
