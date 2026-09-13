'use client';

import { Film } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import styles from './MediaDashboard.module.scss';

const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p/w780';

interface MediaPosterProps {
  title: string;
  posterPath: string | null;
  onOpen?: () => void;
}

export function MediaPoster({ title, posterPath, onOpen }: MediaPosterProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(posterPath) && !failed;
  const content = showImage ? (
    <Image
      src={`${TMDB_IMAGE_ROOT}${posterPath}`}
      alt={`Portada de ${title}`}
      fill
      unoptimized
      sizes="(min-width: 1180px) 340px, (min-width: 620px) 45vw, 92vw"
      className={styles['poster-image']}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={styles['poster-fallback']} aria-label={`Sin portada disponible para ${title}`}>
      <Film size={30} aria-hidden="true" />
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
