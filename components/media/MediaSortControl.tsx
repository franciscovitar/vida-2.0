'use client';

import type { MediaFilterOptions } from '@/lib/media/view';
import type { MediaSort } from '@/types/media';

import styles from './MediaDashboard.module.scss';

type SortCriterion =
  | 'bank-priority'
  | 'focus-priority'
  | 'next-season-priority'
  | 'rating'
  | 'estimated-affinity'
  | 'next-season-affinity'
  | 'cinephile'
  | 'next-season-cinephile'
  | 'cultural'
  | 'next-season-cultural'
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
  'next-season-priority': 'next-season-priority-asc',
  rating: 'rating-asc',
  'estimated-affinity': 'estimated-affinity-asc',
  'next-season-affinity': 'next-season-affinity-asc',
  cinephile: 'cinephile-asc',
  'next-season-cinephile': 'next-season-cinephile-asc',
  cultural: 'cultural-asc',
  'next-season-cultural': 'next-season-cultural-asc',
  year: 'year-asc',
  title: 'title',
};

const DESCENDING: Record<SortCriterion, MediaSort> = {
  'bank-priority': 'bank-priority',
  'focus-priority': 'focus-priority',
  'next-season-priority': 'next-season-priority-desc',
  rating: 'rating-desc',
  'estimated-affinity': 'estimated-affinity-desc',
  'next-season-affinity': 'next-season-affinity-desc',
  cinephile: 'cinephile-desc',
  'next-season-cinephile': 'next-season-cinephile-desc',
  cultural: 'cultural-desc',
  'next-season-cultural': 'next-season-cultural-desc',
  year: 'year-desc',
  title: 'title-desc',
};

function criterionFor(sort: MediaSort): SortCriterion {
  if (sort === 'bank-priority') return 'bank-priority';
  if (sort === 'focus-priority' || sort === 'focus-priority-asc') return 'focus-priority';
  if (sort === 'next-season-priority-desc' || sort === 'next-season-priority-asc') {
    return 'next-season-priority';
  }
  if (sort === 'rating-desc' || sort === 'rating-asc') return 'rating';
  if (sort === 'estimated-affinity-desc' || sort === 'estimated-affinity-asc') {
    return 'estimated-affinity';
  }
  if (sort === 'next-season-affinity-desc' || sort === 'next-season-affinity-asc') {
    return 'next-season-affinity';
  }
  if (sort === 'cinephile-desc' || sort === 'cinephile-asc') return 'cinephile';
  if (sort === 'next-season-cinephile-desc' || sort === 'next-season-cinephile-asc') {
    return 'next-season-cinephile';
  }
  if (sort === 'cultural-desc' || sort === 'cultural-asc') return 'cultural';
  if (sort === 'next-season-cultural-desc' || sort === 'next-season-cultural-asc') {
    return 'next-season-cultural';
  }
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
    {
      value: 'focus-priority',
      label: 'Prioridad · serie/obra completa',
      visible: options.hasWatchPriority,
    },
    {
      value: 'next-season-priority',
      label: 'Prioridad · próxima temporada',
      visible: options.hasNextSeasonPriority,
    },
    { value: 'rating', label: 'Mi nota', visible: showRating },
    {
      value: 'estimated-affinity',
      label: 'Afinidad · serie/obra completa',
      visible: options.hasEstimatedAffinity,
    },
    {
      value: 'next-season-affinity',
      label: 'Afinidad · próxima temporada',
      visible: options.hasNextSeasonAffinity,
    },
    { value: 'cinephile', label: 'Valor cinéfilo · obra completa', visible: options.hasCinephile },
    {
      value: 'next-season-cinephile',
      label: 'Valor cinéfilo · próxima temporada',
      visible: options.hasNextSeasonCinephile,
    },
    {
      value: 'cultural',
      label: 'Presencia cultural · obra completa',
      visible: options.hasCultural,
    },
    {
      value: 'next-season-cultural',
      label: 'Presencia cultural · próxima temporada',
      visible: options.hasNextSeasonCultural,
    },
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
