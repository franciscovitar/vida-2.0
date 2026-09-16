'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

import { useCinephilePath } from '@/components/media/CinephilePathContext';
import { ExternalRatingsPanel } from '@/components/media/ExternalRatingsPanel';
import { MediaCountryFlags } from '@/components/media/MediaCountryFlags';
import { MediaPoster } from '@/components/media/MediaPoster';
import { MediaTrackerControl } from '@/components/media/MediaTrackerControl';
import { SeasonRatingControl } from '@/components/media/SeasonRatingControl';
import { Badge } from '@/components/ui/Badge';
import { cinephileObligationFor, obligationLabel } from '@/lib/media/cinephile-canon';
import { watchPriorityScore } from '@/lib/media/focus';
import { formatExternalMediaScore } from '@/lib/media/score-format';
import { seasonWatchPriorityScore } from '@/lib/media/seasons';
import type { MediaTitleView } from '@/types/media';

import styles from './MediaDashboard.module.scss';

interface MediaDetailDialogProps {
  item: MediaTitleView | null;
  onClose: () => void;
}

function score(value: number | null): string {
  return value === null
    ? '—'
    : value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pathPoints(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

export function MediaDetailDialog({ item, onClose }: MediaDetailDialogProps) {
  const cinephilePath = useCinephilePath();

  useEffect(() => {
    if (!item) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [item, onClose]);

  if (!item) return null;

  const priority = watchPriorityScore(item);
  const commitment = runtimeLabel(item);
  const obligation = cinephileObligationFor(item);
  const showGeneralRating = item.rating !== null;
  const pathGain = cinephilePath?.gainsByKey.get(item.key) ?? null;
  const ratedSeasons = item.seasonDetails.filter((season) => season.observedRating !== null).length;

  return (
    <div
      className={styles['detail-backdrop']}
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className={styles['detail-panel']}
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-detail-title"
      >
        <button
          type="button"
          className={styles['detail-close']}
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          <X size={19} aria-hidden="true" />
        </button>

        <div className={styles['detail-layout']}>
          <div className={styles['detail-poster']}>
            <MediaPoster title={item.title} posterPath={item.posterPath} />
          </div>

          <div className={styles['detail-content']}>
            <div className={styles['detail-heading']}>
              <div>
                <h2 id="media-detail-title">{item.title}</h2>
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
              {item.ageFeelLabel ? <Badge variant="outline">{item.ageFeelLabel}</Badge> : null}
              {item.radar ? <Badge domain="projects">Radar</Badge> : null}
            </div>

            <div className={styles.meta}>
              {item.creator ? <span>{item.creator}</span> : null}
              {commitment ? <span>{commitment}</span> : null}
              <MediaCountryFlags countries={item.countries} />
            </div>

            {item.genres.length > 0 ? (
              <div className={styles.genres}>
                {item.genres.map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
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

            {showGeneralRating ? (
              <div className={styles['season-observed']} aria-label="Mi nota observada">
                <span>{item.medium === 'series' ? 'Mi nota general' : 'Mi nota'}</span>
                <strong>{score(item.rating)}</strong>
              </div>
            ) : null}

            {item.cinephileValue !== null || item.culturalImpact !== null ? (
              <div className={styles['inferred-scores']}>
                {item.cinephileValue !== null ? (
                  <span>
                    Valor cinéfilo{' '}
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

            {pathGain && (pathGain.mediumGain > 0 || pathGain.globalGain > 0) ? (
              <section
                className={styles['detail-description']}
                aria-label="Aporte al Camino del cinéfilo"
              >
                <h3>Camino del cinéfilo</h3>
                <p>
                  Si la ves, suma aproximadamente +{pathPoints(pathGain.mediumGain)} puntos
                  porcentuales en {item.medium === 'movie' ? 'Películas' : 'Series'} y +
                  {pathPoints(pathGain.globalGain)} puntos globales. {pathGain.reason}.
                </p>
              </section>
            ) : null}

            <ExternalRatingsPanel key={item.key} itemKey={item.key} />

            <MediaTrackerControl key={item.key} item={item} onSaved={onClose} />

            {item.medium === 'series' && item.seasonDetails.length > 0 ? (
              <section className={styles['season-section']} aria-label="Temporadas">
                <div className={styles['season-heading']}>
                  <div>
                    <h3>Temporadas</h3>
                    <p>
                      {ratedSeasons}/{item.seasonDetails.length} con nota tuya. Mi nota general y
                      las notas por temporada se conservan por separado; lo que nunca registraste
                      queda explícitamente como “Sin registrar”.
                    </p>
                  </div>
                  {item.nextSeasonNumber !== null ? (
                    <Badge domain="projects">Siguiente · T{item.nextSeasonNumber}</Badge>
                  ) : null}
                </div>
                <div className={styles['season-grid']}>
                  {item.seasonDetails.map((season) => {
                    const seasonPriority = seasonWatchPriorityScore(season);
                    return (
                      <article
                        key={season.seasonNumber}
                        className={styles['season-card']}
                        data-next={season.seasonNumber === item.nextSeasonNumber}
                      >
                        <div className={styles['season-card-heading']}>
                          <strong>Temporada {season.seasonNumber}</strong>
                          <span>
                            {season.year ?? 'Año sin confirmar'}
                            {season.episodeCount !== null ? ` · ${season.episodeCount} ep.` : ''}
                          </span>
                        </div>
                        <div className={styles['season-score-grid']}>
                          <span>
                            Afinidad para mí <strong>{score(season.estimatedAffinity)}</strong>
                          </span>
                          <span>
                            Prioridad <strong>{score(seasonPriority)}</strong>
                          </span>
                          <span>
                            Cinéfilo{' '}
                            <strong>
                              {formatExternalMediaScore(season.cinephileValue, season.scoreVersion)}
                            </strong>
                          </span>
                          <span>
                            Presencia cultural{' '}
                            <strong>
                              {formatExternalMediaScore(
                                season.culturalPresence,
                                season.scoreVersion,
                              )}
                            </strong>
                          </span>
                        </div>
                        <SeasonRatingControl
                          itemKey={item.key}
                          seasonNumber={season.seasonNumber}
                          rating={season.observedRating}
                        />
                        {season.evidenceState !== 'ready' ? (
                          <small className={styles['season-evidence']}>
                            {season.evidenceState === 'partial'
                              ? 'Evidencia parcial: lo desconocido no se fuerza a una nota.'
                              : 'Sin evidencia suficiente para completar todas las notas.'}
                          </small>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {item.spoilerFreeSummary ? (
              <section className={styles['detail-description']}>
                <h3>Sin spoilers</h3>
                <p>{item.spoilerFreeSummary}</p>
              </section>
            ) : null}
            {item.whatToExpect ? (
              <section className={styles['detail-description']}>
                <h3>Qué esperar</h3>
                <p>{item.whatToExpect}</p>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
