from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Poster quality/reliability: keep TMDB as source, use its portrait rendition directly.
replace_once(
    "components/media/MediaPoster.tsx",
    "const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p/w500';",
    "const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p/w780';",
)
replace_once(
    "components/media/MediaPoster.tsx",
    "      fill\n      sizes=\"(min-width: 1180px) 340px, (min-width: 620px) 45vw, 92vw\"",
    "      fill\n      unoptimized\n      sizes=\"(min-width: 1180px) 340px, (min-width: 620px) 45vw, 92vw\"",
)

# Prevent card-level detail click from swallowing manual-priority interactions.
replace_once(
    "components/media/ManualFocusControl.tsx",
    "    <div className={styles.control}>",
    "    <div\n      className={styles.control}\n      onClick={(event) => event.stopPropagation()}\n      onKeyDown={(event) => event.stopPropagation()}\n    >",
)

sort_component = r'''\'use client\';

import type { MediaFilterOptions } from '@/lib/media/view';
import type { MediaSort } from '@/types/media';

import styles from './MediaDashboard.module.scss';

type SortCriterion =
  | 'bank-priority'
  | 'focus-priority'
  | 'rating'
  | 'estimated-affinity'
  | 'cinephile'
  | 'cultural'
  | 'year'
  | 'title';

type SortDirection = 'asc' | 'desc';

interface MediaSortControlProps {
  value: MediaSort;
  options: MediaFilterOptions;
  includeBankPriority?: boolean;
  showRating?: boolean;
  onChange: (sort: MediaSort) => void;
}

const ASCENDING: Record<Exclude<SortCriterion, 'bank-priority'>, MediaSort> = {
  'focus-priority': 'focus-priority-asc',
  rating: 'rating-asc',
  'estimated-affinity': 'estimated-affinity-asc',
  cinephile: 'cinephile-asc',
  cultural: 'cultural-asc',
  year: 'year-asc',
  title: 'title',
};

const DESCENDING: Record<SortCriterion, MediaSort> = {
  'bank-priority': 'bank-priority',
  'focus-priority': 'focus-priority',
  rating: 'rating-desc',
  'estimated-affinity': 'estimated-affinity-desc',
  cinephile: 'cinephile-desc',
  cultural: 'cultural-desc',
  year: 'year-desc',
  title: 'title-desc',
};

function criterionFor(sort: MediaSort): SortCriterion {
  if (sort === 'bank-priority') return 'bank-priority';
  if (sort === 'focus-priority' || sort === 'focus-priority-asc') return 'focus-priority';
  if (sort === 'rating-desc' || sort === 'rating-asc') return 'rating';
  if (sort === 'estimated-affinity-desc' || sort === 'estimated-affinity-asc') {
    return 'estimated-affinity';
  }
  if (sort === 'cinephile-desc' || sort === 'cinephile-asc') return 'cinephile';
  if (sort === 'cultural-desc' || sort === 'cultural-asc') return 'cultural';
  if (sort === 'year-desc' || sort === 'year-asc') return 'year';
  if (sort === 'title' || sort === 'title-desc') return 'title';
  return 'bank-priority';
}

function directionFor(sort: MediaSort): SortDirection {
  return sort.endsWith('-asc') || sort === 'title' ? 'asc' : 'desc';
}

function sortFor(criterion: SortCriterion, direction: SortDirection): MediaSort {
  if (criterion === 'bank-priority') return 'bank-priority';
  return direction === 'asc' ? ASCENDING[criterion] : DESCENDING[criterion];
}

export function MediaSortControl({
  value,
  options,
  includeBankPriority = false,
  showRating = false,
  onChange,
}: MediaSortControlProps) {
  const criterion = criterionFor(value);
  const direction = directionFor(value);
  const directionLocked = criterion === 'bank-priority';

  const choices: { value: SortCriterion; label: string; visible: boolean }[] = [
    { value: 'bank-priority', label: 'Prioridad del banco', visible: includeBankPriority },
    { value: 'focus-priority', label: 'Prioridad de visionado', visible: options.hasWatchPriority },
    { value: 'rating', label: 'Mi nota', visible: showRating },
    {
      value: 'estimated-affinity',
      label: 'Afinidad para mí',
      visible: options.hasEstimatedAffinity,
    },
    { value: 'cinephile', label: 'Valor cinéfilo', visible: options.hasCinephile },
    { value: 'cultural', label: 'Impacto cultural', visible: options.hasCultural },
    { value: 'year', label: 'Año', visible: true },
    { value: 'title', label: 'Título', visible: true },
  ];

  return (
    <div className={styles['sort-control']}>
      <label className={styles['sort-field']}>
        <span>Ordenar por</span>
        <select
          value={criterion}
          onChange={(event) =>
            onChange(sortFor(event.target.value as SortCriterion, direction))
          }
        >
          {choices
            .filter((choice) => choice.visible)
            .map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        className={styles['sort-direction']}
        disabled={directionLocked}
        aria-label={
          directionLocked
            ? 'Prioridad del banco usa su orden canónico'
            : direction === 'desc'
              ? 'Orden descendente. Cambiar a ascendente'
              : 'Orden ascendente. Cambiar a descendente'
        }
        title={
          directionLocked
            ? 'Orden canónico del banco'
            : direction === 'desc'
              ? 'Descendente'
              : 'Ascendente'
        }
        onClick={() => onChange(sortFor(criterion, direction === 'desc' ? 'asc' : 'desc'))}
      >
        <span aria-hidden="true">{direction === 'desc' ? '↓' : '↑'}</span>
      </button>
    </div>
  );
}
'''
Path("components/media/MediaSortControl.tsx").write_text(sort_component, encoding="utf-8")

# Focus view: reusable sort control and whole-card detail interaction.
replace_once(
    "components/media/MediaFocusDashboard.tsx",
    "import { MediaPoster } from '@/components/media/MediaPoster';\n",
    "import { MediaPoster } from '@/components/media/MediaPoster';\nimport { MediaSortControl } from '@/components/media/MediaSortControl';\n",
)
replace_once(
    "components/media/MediaFocusDashboard.tsx",
    "  MediaKind,\n  MediaSort,\n  MediaTitleView,",
    "  MediaKind,\n  MediaTitleView,",
)
old_focus_sort = r'''          <label>
            <span>Ordenar visualmente</span>
            <select
              value={filters.sort}
              onChange={(event) => patchFilters({ sort: event.target.value as MediaSort })}
            >
              <option value="focus-priority">Prioridad · mayor a menor</option>
              <option value="focus-priority-asc">Prioridad · menor a mayor</option>
              {options.hasEstimatedAffinity ? (
                <>
                  <option value="estimated-affinity-desc">Afinidad para mí · mayor a menor</option>
                  <option value="estimated-affinity-asc">Afinidad para mí · menor a mayor</option>
                </>
              ) : null}
              {options.hasCinephile ? (
                <>
                  <option value="cinephile-desc">Valor cinéfilo · mayor a menor</option>
                  <option value="cinephile-asc">Valor cinéfilo · menor a mayor</option>
                </>
              ) : null}
              {options.hasCultural ? (
                <>
                  <option value="cultural-desc">Impacto cultural · mayor a menor</option>
                  <option value="cultural-asc">Impacto cultural · menor a mayor</option>
                </>
              ) : null}
              <option value="year-desc">Más recientes</option>
              <option value="year-asc">Más antiguas</option>
              <option value="title">Título A–Z</option>
              <option value="title-desc">Título Z–A</option>
            </select>
          </label>'''
replace_once(
    "components/media/MediaFocusDashboard.tsx",
    old_focus_sort,
    "          <MediaSortControl\n            value={filters.sort}\n            options={options}\n            onChange={(sort) => patchFilters({ sort })}\n          />",
)
replace_once(
    "components/media/MediaFocusDashboard.tsx",
    "              <article key={item.key} className={styles['title-card']}>",
    "              <article\n                key={item.key}\n                className={styles['title-card']}\n                role=\"button\"\n                tabIndex={0}\n                aria-label={`Ver detalles de ${item.title}`}\n                onClick={() => setSelectedItem(item)}\n                onKeyDown={(event) => {\n                  if (event.target !== event.currentTarget) return;\n                  if (event.key === 'Enter' || event.key === ' ') {\n                    event.preventDefault();\n                    setSelectedItem(item);\n                  }\n                }}\n              >",
)
replace_once(
    "components/media/MediaFocusDashboard.tsx",
    "                <MediaPoster\n                  title={item.title}\n                  posterPath={item.posterPath}\n                  onOpen={() => setSelectedItem(item)}\n                />",
    "                <MediaPoster title={item.title} posterPath={item.posterPath} />",
)
old_focus_genres = r'''                  {item.genres.length > 0 ? (
                    <div className={styles.genres}>
                      {item.genres.slice(0, 3).map((genre) => (
                        <span key={genre}>{genre}</span>
                      ))}
                    </div>
                  ) : null}
                  {item.ageFeelLabel ? (
                    <p
                      className={styles['age-feel']}
                      title="Señal derivada de año y perfil de experiencia; no es una valoración objetiva."
                    >
                      {item.ageFeelLabel}
                    </p>
                  ) : null}'''
new_focus_genres = r'''                  <div className={styles.genres}>
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
                  </div>'''
replace_once("components/media/MediaFocusDashboard.tsx", old_focus_genres, new_focus_genres)
old_focus_button = r'''                  <button
                    type="button"
                    className={styles['detail-button']}
                    onClick={() => setSelectedItem(item)}
                  >
                    Ver detalles
                  </button>
'''
replace_once("components/media/MediaFocusDashboard.tsx", old_focus_button, "")

# Full bank: same interactions and compact sorting.
replace_once(
    "components/media/MediaDashboard.tsx",
    "import { MediaPoster } from '@/components/media/MediaPoster';\n",
    "import { MediaPoster } from '@/components/media/MediaPoster';\nimport { MediaSortControl } from '@/components/media/MediaSortControl';\n",
)
replace_once(
    "components/media/MediaDashboard.tsx",
    "  MediaKind,\n  MediaSort,\n  MediaTitleView,",
    "  MediaKind,\n  MediaTitleView,",
)
old_bank_sort = r'''          <label>
            <span>Ordenar</span>
            <select
              value={filters.sort}
              onChange={(event) => patchFilters({ sort: event.target.value as MediaSort })}
            >
              <option value="bank-priority">Prioridad del banco</option>
              {options.hasWatchPriority ? (
                <>
                  <option value="focus-priority">Prioridad · mayor a menor</option>
                  <option value="focus-priority-asc">Prioridad · menor a mayor</option>
                </>
              ) : null}
              <option value="rating-desc">Mi nota · mayor a menor</option>
              <option value="rating-asc">Mi nota · menor a mayor</option>
              {options.hasEstimatedAffinity ? (
                <>
                  <option value="estimated-affinity-desc">Afinidad para mí · mayor a menor</option>
                  <option value="estimated-affinity-asc">Afinidad para mí · menor a mayor</option>
                </>
              ) : null}
              {options.hasCinephile ? (
                <>
                  <option value="cinephile-desc">Valor cinéfilo · mayor a menor</option>
                  <option value="cinephile-asc">Valor cinéfilo · menor a mayor</option>
                </>
              ) : null}
              {options.hasCultural ? (
                <>
                  <option value="cultural-desc">Impacto cultural · mayor a menor</option>
                  <option value="cultural-asc">Impacto cultural · menor a mayor</option>
                </>
              ) : null}
              <option value="year-desc">Más recientes</option>
              <option value="year-asc">Más antiguas</option>
              <option value="title">Título A–Z</option>
              <option value="title-desc">Título Z–A</option>
            </select>
          </label>'''
replace_once(
    "components/media/MediaDashboard.tsx",
    old_bank_sort,
    "          <MediaSortControl\n            value={filters.sort}\n            options={options}\n            includeBankPriority\n            showRating\n            onChange={(sort) => patchFilters({ sort })}\n          />",
)
replace_once(
    "components/media/MediaDashboard.tsx",
    "              <article key={item.key} className={styles['title-card']}>",
    "              <article\n                key={item.key}\n                className={styles['title-card']}\n                role=\"button\"\n                tabIndex={0}\n                aria-label={`Ver detalles de ${item.title}`}\n                onClick={() => setSelectedItem(item)}\n                onKeyDown={(event) => {\n                  if (event.target !== event.currentTarget) return;\n                  if (event.key === 'Enter' || event.key === ' ') {\n                    event.preventDefault();\n                    setSelectedItem(item);\n                  }\n                }}\n              >",
)
replace_once(
    "components/media/MediaDashboard.tsx",
    "                <MediaPoster\n                  title={item.title}\n                  posterPath={item.posterPath}\n                  onOpen={() => setSelectedItem(item)}\n                />",
    "                <MediaPoster title={item.title} posterPath={item.posterPath} />",
)
old_bank_genres = r'''                  {item.genres.length > 0 ? (
                    <div className={styles.genres}>
                      {item.genres.slice(0, 4).map((genre) => (
                        <span key={genre}>{genre}</span>
                      ))}
                    </div>
                  ) : null}
                  {item.ageFeelLabel ? (
                    <p
                      className={styles['age-feel']}
                      title="Señal derivada de año y perfil de experiencia; no es una valoración objetiva."
                    >
                      {item.ageFeelLabel}
                    </p>
                  ) : null}'''
new_bank_genres = r'''                  <div className={styles.genres}>
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
                  </div>'''
replace_once("components/media/MediaDashboard.tsx", old_bank_genres, new_bank_genres)
old_bank_button = r'''                  <button
                    type="button"
                    className={styles['detail-button']}
                    onClick={() => setSelectedItem(item)}
                  >
                    Ver detalles
                  </button>
'''
replace_once("components/media/MediaDashboard.tsx", old_bank_button, "")

# UI alignment/portrait poster/sort toggle. Append late so it intentionally overrides older responsive heights.
css = r'''

/* Final catalog polish: native poster ratio, uniform score alignment and compact sorting. */
.sort-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  gap: 0.45rem;
  align-items: end;
  min-width: 0;
}

.sort-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.sort-field > span {
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 650;
}

.sort-field select {
  width: 100%;
  min-height: 42px;
  padding: 0.55rem 2rem 0.55rem 0.65rem;
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.sort-direction {
  display: grid;
  width: 42px;
  min-height: 42px;
  padding: 0;
  color: var(--text);
  font: inherit;
  font-size: 1.2rem;
  font-weight: 750;
  cursor: pointer;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  place-items: center;
}

.sort-direction:hover:not(:disabled) {
  border-color: var(--text-subtle);
}

.sort-direction:disabled {
  color: var(--text-subtle);
  cursor: default;
  opacity: 0.55;
}

.sort-field select:focus-visible,
.sort-direction:focus-visible,
.title-card:focus-visible {
  outline: 3px solid var(--ring);
  outline-offset: 2px;
}

.title-card {
  height: 100%;
  cursor: pointer;
  transition:
    transform 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.title-card:hover {
  border-color: var(--text-subtle);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.title-card > .poster {
  width: 100%;
  height: auto;
  aspect-ratio: 2 / 3;
}

.card-content {
  flex: 1 1 auto;
}

.title-top {
  min-height: 2.7rem;
}

.badges {
  min-height: 1.7rem;
  max-height: 3.7rem;
  overflow: hidden;
}

.meta {
  min-height: 2rem;
}

.genres {
  flex-wrap: nowrap;
  min-height: 1.55rem;
  overflow: hidden;
}

.genres span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.age-feel-slot {
  display: flex;
  min-height: 1.9rem;
  align-items: flex-start;
}

.primary-scores {
  margin-top: auto;
}

@media (width >= 620px) {
  .title-card > .poster {
    height: auto;
  }
}

@media (width >= 1180px) {
  .title-card > .poster {
    height: auto;
  }
}
'''
with Path("components/media/MediaDashboard.module.scss").open("a", encoding="utf-8") as handle:
    handle.write(css)
