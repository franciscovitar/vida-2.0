import { CircleAlert, Info } from 'lucide-react';
import Link from 'next/link';

import { intelligenceArticleHref } from '@/lib/intelligence/contract';
import type { IntelligenceEditorialData, IntelligenceFront } from '@/types/intelligence-editorial';
import { UnifiedLibrary360 } from '@/components/professional/UnifiedLibrary360';
import type { Library360Data } from '@/types/library-360';

import styles from './ProfessionalV2.module.scss';

const FRONT_LABELS: Record<IntelligenceFront, string> = {
  ia: 'IA',
  carrera: 'Carrera',
  tecnologia: 'Tecnología',
  pas: 'PAS',
};

export function ProfessionalLibrary({
  editorial,
  library360,
}: {
  editorial: IntelligenceEditorialData;
  library360: Library360Data;
}) {
  const editorialSnapshot =
    editorial.status === 'ready' && editorial.snapshot ? editorial.snapshot : null;
  const deepDives = editorialSnapshot
    ? [...editorialSnapshot.archive]
        .filter((article) => article.professionalRefs.length > 0)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    : [];
  const historicalArticles = editorialSnapshot
    ? [...editorialSnapshot.archive]
        .filter((article) => article.professionalRefs.length === 0)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    : [];

  return (
    <div className={styles.library}>
      <section className={styles['library-hero']} aria-labelledby="professional-library-title">
        <p className={styles.eyebrow}>Biblioteca profesional</p>
        <h2 id="professional-library-title">Guardado no significa pendiente</h2>

        <div className={styles['library-meta']}>
          <span>{editorialSnapshot?.archive.length ?? 0} artículos históricos</span>
          <span>{library360.snapshot?.totalEntries ?? 0} referencias tecnológicas</span>
        </div>
      </section>

      <section className={styles['library-section']} aria-labelledby="library-deep-dives-title">
        <div className={styles['library-heading']}>
          <p className={styles.eyebrow}>Deep dives profesionales</p>
          <h3 id="library-deep-dives-title">Explicaciones conectadas con tu perfil</h3>
        </div>

        {editorial.notice ? (
          <div
            className={styles.notice}
            data-tone={editorial.stale ? 'warning' : 'info'}
            role="status"
          >
            {editorial.stale ? (
              <CircleAlert size={16} aria-hidden="true" />
            ) : (
              <Info size={16} aria-hidden="true" />
            )}
            <span>{editorial.notice}</span>
          </div>
        ) : null}

        {editorialSnapshot ? (
          <div className={styles['library-article-list']}>
            {deepDives.map((article) => (
              <article className={styles['library-article']} key={article.id}>
                <div className={styles['library-article-meta']}>
                  <span>{FRONT_LABELS[article.front]}</span>
                  <span>{article.readingMinutes} min</span>
                  <span>{article.publishedAt}</span>
                </div>
                <h4>{article.title}</h4>
                <p>{article.dek}</p>
                <Link href={intelligenceArticleHref(article)}>Leer explicación →</Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.notice} data-tone="warning" role="status">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{editorial.notice ?? 'El archivo editorial no está disponible.'}</span>
          </div>
        )}
      </section>

      {editorialSnapshot ? (
        <section className={styles['library-section']} aria-labelledby="library-history-title">
          <div className={styles['library-heading']}>
            <p className={styles.eyebrow}>Archivo histórico</p>
            <h3 id="library-history-title">Otras explicaciones que siguen disponibles</h3>
            <p>Conservamos sus enlaces originales; no describen necesariamente tu estado actual.</p>
          </div>

          <div className={styles['library-article-list']}>
            {historicalArticles.map((article) => (
              <article className={styles['library-article']} key={article.id}>
                <div className={styles['library-article-meta']}>
                  <span>{FRONT_LABELS[article.front]}</span>
                  <span>{article.readingMinutes} min</span>
                  <span>{article.publishedAt}</span>
                </div>
                <h4>{article.title}</h4>
                <p>{article.dek}</p>
                <Link href={intelligenceArticleHref(article)}>Abrir archivo →</Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <UnifiedLibrary360 data={library360} />

      <footer className={styles['library-provenance']}>
        {editorialSnapshot ? (
          <>Editorial <code>{editorialSnapshot.source.commit.slice(0, 8)}</code></>
        ) : (
          'Editorial no disponible'
        )}
        {' · '}
        {library360.snapshot ? (
          <>Biblioteca 360° <code>{library360.snapshot.source.commit.slice(0, 8)}</code></>
        ) : (
          'Biblioteca 360° no disponible'
        )}
      </footer>
    </div>
  );
}
