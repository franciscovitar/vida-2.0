'use client';

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
          onChange={(event) => onChange(sortFor(event.target.value as SortCriterion, direction))}
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
