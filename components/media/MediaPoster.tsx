'use client';

import { Film } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import styles from './MediaDashboard.module.scss';
import posterStyles from './MediaPoster.module.scss';

const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p/w780';

interface MediaPosterProps {
  title: string;
  posterPath: string | null;
  onOpen?: () => void;
}

export function MediaPoster({ title, posterPath, onOpen }: MediaPosterProps) {
  const [failedPosterPath, setFailedPosterPath] = useState<string | null>(null);
  const showImage = Boolean(posterPath) && failedPosterPath !== posterPath;
  const content = showImage ? (
    <Image
      src={`${TMDB_IMAGE_ROOT}${posterPath}`}
      alt={`Portada de ${title}`}
      fill
      unoptimized
      sizes="(min-width: 1180px) 340px, (min-width: 620px) 45vw, 92vw"
      className={styles['poster-image']}
      onError={() => setFailedPosterPath(posterPath)}
    />
  ) : (
    <div className={styles['poster-fallback']} aria-label={`Sin portada disponible para ${title}`}>
      <div className={posterStyles.content}>
        <Film size={30} aria-hidden="true" />
        <span className={posterStyles.title}>{title}</span>
        <span className={posterStyles.label}>
          {posterPath ? 'Portada no disponible' : 'Portada pendiente'}
        </span>
      </div>
    </div>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        className={`${styles.poster} ${styles['poster-button']}`}
        onClick={onOpen}
        aria-label={`Ver detalles de ${title}`}
      >
        {content}
      </button>
    );
  }

  return <div className={styles.poster}>{content}</div>;
}
