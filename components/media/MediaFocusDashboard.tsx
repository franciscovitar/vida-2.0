'use client';

import { Film, Search, SlidersHorizontal, Tv } from 'lucide-react';
import { useMemo, useState } from 'react';

import { MediaDashboardView } from '@/components/media/MediaDashboard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  deriveFocusTitles,
  focusEligibleTitles,
  focusLimit,
  type MediaFocusLevel,
} from '@/lib/media/focus';
import { deriveMediaFilterOptions, filterMediaTitles, sortMediaTitles } from '@/lib/media/view';
import type {
  MediaCommitmentFilter,
  MediaDashboardData,
  MediaFilters,
  MediaKind,
  MediaSort,
  MediaTitleView,
} from '@/types/media';

import styles from './MediaDashboard.module.scss';

const FOCUS_LEVELS: MediaFocusLevel[] = [1, 2, 3];

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
    filters.sort !== 'bank-priority',
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
  const [filters, setFilters] = useState<MediaFilters>(() => initialFilters(firstReadyMedium));
  const [level, setLevel] = useState<MediaFocusLevel>(1);
  const [exploring, setExploring] = useState(false);

  const eligiblePool = useMemo(
    () => focusEligibleTitles(data.titles, filters.medium),
    [data.titles, filters.medium],
  );
  const options = useMemo(
    () => deriveMediaFilterOptions(eligiblePool, filters.medium),
    [eligiblePool, filters.medium],
  );
  const filteredPool = useMemo(
    () => filterMediaTitles(eligiblePool, { ...filters, collection: 'all' }),
    [eligiblePool, filters],
  );
  const focusByLevel = useMemo(
    () =>
      new Map(
        FOCUS_LEVELS.map((focusLevel) => [
          focusLevel,
          deriveFocusTitles(filteredPool, filters.medium, focusLevel),
        ]),
      ),
    [filteredPool, filters.medium],
  );

  const selectedFocus = focusByLevel.get(level) ?? [];
  const focus =
    filters.sort === 'bank-priority'
      ? selectedFocus
      : sortMediaTitles(selectedFocus, filters.sort);

  function patchFilters(patch: Partial<MediaFilters>) {
    setFilters((current) => ({ ...current, ...patch, collection: 'all' }));
  }

  function patchYearFrom(yearFrom: string) {
    setFilters((current) => ({
      ...current,
      collection: 'all',
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
      collection: 'all',
      yearFrom:
        yearTo && current.yearFrom && Number(yearTo) < Number(current.yearFrom)
          ? yearTo
          : current.yearFrom,
      yearTo,
    }));
  }

  function switchMedium(next: MediaKind) {
    setFilters(initialFilters(next));
    setLevel(1);
  }

  function clearFilters() {
    setFilters(initialFilters(filters.medium));
  }

  if (data.status === 'unavailable') {
    return <MediaDashboardView data={data} />;
  }

  if (exploring) {
    return (
      <div className={styles.stack}>
        <section className={styles.hero} aria-label="Explorador completo">
          <p className={styles['bank-principle']}>
            <strong>Estás explorando el Banco completo.</strong> Nada de esto es una lista de
            pendientes.
          </p>
          <div>
            <button
              type="button"
              className={styles['empty-action']}
              onClick={() => setExploring(false)}
            >
              Volver a Foco
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

      <section className={styles.hero} aria-label="Foco de Media">
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
          <strong>Foco reduce opciones sin borrar nada.</strong> Cada nivel contiene al anterior;
          ampliá sólo cuando quieras más variedad.
        </p>

        <div className={styles['collection-tabs']} role="group" aria-label="Nivel de Foco">
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
                Foco {focusLevel} · {count}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.controls} aria-label="Filtros de Foco">
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
            <span>Ordenar</span>
            <select
              value={filters.sort}
              onChange={(event) => patchFilters({ sort: event.target.value as MediaSort })}
            >
              <option value="bank-priority">Prioridad del Foco</option>
              <option value="rating-desc">Mi nota</option>
              {options.hasAffinity ? <option value="affinity-desc">Afinidad estimada</option> : null}
              {options.hasCultural ? (
                <option value="cultural-desc">Popularidad / impacto cultural</option>
              ) : null}
              {options.hasCinephile ? (
                <option value="cinephile-desc">Valor cinéfilo / culto</option>
              ) : null}
              {options.hasScores ? <option value="score-desc">Score general</option> : null}
              <option value="year-desc">Más recientes</option>
              <option value="title">Título A–Z</option>
            </select>
          </label>
        </div>
      </section>

      <div className={styles['result-header']}>
        <div>
          <strong>Foco {level}</strong>
          <span>
            {' '}
            · {levelPurpose(level)} · {focus.length} de {filteredPool.length} opciones filtradas
          </span>
        </div>
        <span className={styles['score-note']}>
          Afinidad estimada en lectura; no modifica tu Nota ni escribe el Sheet.
        </span>
      </div>

      {focus.length === 0 ? (
        <EmptyState
          icon={filters.medium === 'movie' ? Film : Tv}
          title="No hay opciones elegibles con estos filtros"
          description="El Banco no se modificó. Limpiá filtros o abrí el explorador completo para revisar todo."
          action={
            <button type="button" className={styles['empty-action']} onClick={clearFilters}>
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <section className={styles.grid} aria-label={`Foco ${level}`}>
          {focus.map((item, index) => {
            const commitment = commitmentLabel(item);
            const guidance = item.whatToExpect ?? item.spoilerFreeSummary;
            const personalFit = item.personalFitEstimate ?? item.affinity;

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
                  {index === 0 && filters.sort === 'bank-priority' ? (
                    <Badge domain="projects">Primera del Foco</Badge>
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

                {personalFit !== null ||
                item.cinephileValue !== null ||
                item.culturalImpact !== null ? (
                  <div className={styles.scores}>
                    <div className={styles['inferred-scores']}>
                      {personalFit !== null ? (
                        <span>
                          Para vos (est.) <strong>{score(personalFit)}</strong>
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
              </article>
            );
          })}
        </section>
      )}

      <section className={styles.controls} aria-label="Banco completo">
        <p className={styles['bank-principle']}>
          Foco {level} puede mostrar hasta {focusLimit(filters.medium, level)} opciones. El resto
          sigue disponible, sólo queda fuera de vista para reducir ruido.
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
