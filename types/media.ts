export type MediaKind = 'movie' | 'series';

export type MediaSourceState =
  | 'ready'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-tab'
  | 'missing-header'
  | 'read-error';

export type MediaDashboardStatus = 'ready' | 'partial' | 'unavailable';

/**
 * Vista pública de un título para `/media`.
 *
 * Deliberadamente no contiene Media ID, TMDB/IMDb IDs, URLs de fuente ni
 * provenance: esos identificadores internos siguen del lado servidor.
 */
export interface MediaTitleView {
  key: string;
  medium: MediaKind;
  title: string;
  originalTitle: string | null;
  year: number | null;
  state: string;
  bankTier: string | null;
  pool: string | null;
  radar: boolean;
  rating: number | null;
  creator: string | null;
  genres: string[];
  countries: string[];
  runtimeMinutes: number | null;
  seasons: number | null;
  affinity: number | null;
  cinephileValue: number | null;
  culturalImpact: number | null;
  generalScore: number | null;
  whyForMe: string | null;
}

export interface MediaSourceView {
  medium: MediaKind;
  state: MediaSourceState;
  notice: string | null;
}

export interface MediaDashboardData {
  status: MediaDashboardStatus;
  notice: string | null;
  titles: MediaTitleView[];
  sources: MediaSourceView[];
}

export type MediaCollectionFilter = 'all' | 'bank' | 'radar' | 'seen' | 'active';
export type MediaCommitmentFilter =
  | 'all'
  | 'under-90'
  | '90-119'
  | '120-149'
  | '150-plus'
  | 'one-season'
  | 'two-three-seasons'
  | 'four-plus-seasons';
export type MediaSort =
  | 'bank-priority'
  | 'rating-desc'
  | 'affinity-desc'
  | 'cinephile-desc'
  | 'cultural-desc'
  | 'score-desc'
  | 'year-desc'
  | 'title';

export interface MediaFilters {
  medium: MediaKind;
  collection: MediaCollectionFilter;
  query: string;
  genre: string;
  country: string;
  creator: string;
  yearFrom: string;
  yearTo: string;
  commitment: MediaCommitmentFilter;
  sort: MediaSort;
}
