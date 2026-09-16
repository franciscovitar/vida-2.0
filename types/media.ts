export type MediaKind = 'movie' | 'series';
export type MediaFocusLevel = 1 | 2 | 3;
export type MediaManualFocus = MediaFocusLevel | 'exclude' | null;
export type MediaCulturalObligation =
  | 'imprescindible'
  | 'esencial'
  | 'muy-recomendable'
  | 'recomendable'
  | 'complementaria'
  | 'opcional';
export type MediaObligationFilter = 'all' | MediaCulturalObligation;

export type MediaSourceState =
  | 'ready'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-tab'
  | 'missing-header'
  | 'read-error';

export type MediaDashboardStatus = 'ready' | 'partial' | 'unavailable';

export type MediaSeasonEvidenceState = 'ready' | 'partial' | 'unavailable';

/**
 * Vista derivada de una temporada. La nota observada viene exclusivamente de
 * la verdad del usuario ya registrada; el resto son señales derivadas y pueden
 * quedar en null cuando la evidencia todavía no alcanza.
 */
export interface MediaSeasonView {
  seasonNumber: number;
  year: number | null;
  episodeCount: number | null;
  observedRating: number | null;
  estimatedAffinity: number | null;
  cinephileValue: number | null;
  culturalPresence: number | null;
  scoreVersion: string | null;
  evidenceState: MediaSeasonEvidenceState;
}

/**
 * Vista pública de un título para `/media`.
 *
 * Deliberadamente no contiene Media ID, TMDB/IMDb IDs, URLs de fuente,
 * provenance ni el Perfil experiencia crudo: esos identificadores y la
 * estructura interna siguen del lado servidor.
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
  /** Fecha observada del snapshot: vista para películas, terminada para series. */
  observedDate?: string | null;
  /** Opinión personal observada, editable sólo por una acción explícita del tracker. */
  personalOpinion?: string | null;
  creator: string | null;
  genres: string[];
  countries: string[];
  runtimeMinutes: number | null;
  seasons: number | null;
  seasonDetails: MediaSeasonView[];
  nextSeasonNumber: number | null;
  posterPath: string | null;
  affinity: number | null;
  estimatedAffinity: number | null;
  cinephileValue: number | null;
  culturalImpact: number | null;
  generalScore: number | null;
  /** External score provenance; optional for backwards-compatible snapshots/tests. */
  scoreVersion?: string | null;
  manualFocusLevel: MediaFocusLevel | null;
  manualFocusExcluded: boolean;
  ageFeelScore: number | null;
  ageFeelLabel: string | null;
  whyForMe: string | null;
  spoilerFreeSummary: string | null;
  whatToExpect: string | null;
  experienceConfidence: number | null;
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

export type MediaCollectionFilter = 'all' | 'bank' | 'radar' | 'rewatch' | 'seen' | 'active';
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
  | 'focus-priority'
  | 'focus-priority-asc'
  | 'next-season-priority-desc'
  | 'next-season-priority-asc'
  | 'rating-desc'
  | 'rating-asc'
  | 'affinity-desc'
  | 'affinity-asc'
  | 'estimated-affinity-desc'
  | 'estimated-affinity-asc'
  | 'next-season-affinity-desc'
  | 'next-season-affinity-asc'
  | 'cinephile-desc'
  | 'cinephile-asc'
  | 'next-season-cinephile-desc'
  | 'next-season-cinephile-asc'
  | 'cultural-desc'
  | 'cultural-asc'
  | 'next-season-cultural-desc'
  | 'next-season-cultural-asc'
  | 'score-desc'
  | 'score-asc'
  | 'year-desc'
  | 'year-asc'
  | 'title'
  | 'title-desc';

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
  obligation?: MediaObligationFilter;
  sort: MediaSort;
}
