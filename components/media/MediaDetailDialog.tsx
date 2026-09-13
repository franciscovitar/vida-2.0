'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

import { MediaCountryFlags } from '@/components/media/MediaCountryFlags';
import { MediaPoster } from '@/components/media/MediaPoster';
import { Badge } from '@/components/ui/Badge';
import { watchPriorityScore } from '@/lib/media/focus';
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
              <Badge domain={item.state === 'Por ver' ? 'learning' : 'neutral'}>{item.state}</Badge>
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

            <div className={styles['primary-scores']}>
              {item.estimatedAffinity !== null ? (
                <div className={styles['primary-score']}>
                  <span>Afinidad para mí</span>
                  <strong>{score(item.estimatedAffinity)}</strong>
                </div>
              ) : null}
              {priority !== null ? (
                <div className={styles['primary-score']}>
                  <span>Prioridad de visionado</span>
                  <strong>{score(priority)}</strong>
                </div>
              ) : null}
              {item.rating !== null ? (
                <div className={`${styles['primary-score']} ${styles.observed}`}>
                  <span>Mi nota</span>
                  <strong>{score(item.rating)}</strong>
                </div>
              ) : null}
            </div>

            {item.cinephileValue !== null || item.culturalImpact !== null ? (
              <div className={styles['inferred-scores']}>
                {item.cinephileValue !== null ? (
                  <span>
                    Valor cinéfilo <strong>{score(item.cinephileValue)}</strong>
                  </span>
                ) : null}
                {item.culturalImpact !== null ? (
                  <span>
                    Impacto cultural <strong>{score(item.culturalImpact)}</strong>
                  </span>
                ) : null}
              </div>
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
