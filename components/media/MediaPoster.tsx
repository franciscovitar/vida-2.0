import { Film } from 'lucide-react';
import Image from 'next/image';

import styles from './MediaDashboard.module.scss';

const TMDB_IMAGE_ROOT = 'https://image.tmdb.org/t/p/w500';

interface MediaPosterProps {
  title: string;
  posterPath: string | null;
}

export function MediaPoster({ title, posterPath }: MediaPosterProps) {
  return (
    <div className={styles.poster}>
      {posterPath ? (
        <Image
          src={`${TMDB_IMAGE_ROOT}${posterPath}`}
          alt={`Portada de ${title}`}
          fill
          sizes="(min-width: 1080px) 220px, (min-width: 620px) 200px, 34vw"
          className={styles['poster-image']}
        />
      ) : (
        <div
          className={styles['poster-fallback']}
          aria-label={`Sin portada disponible para ${title}`}
        >
          <Film size={30} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
