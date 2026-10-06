import { CircleAlert, ExternalLink, Info } from 'lucide-react';
import Link from 'next/link';

import { intelligenceArticleHref } from '@/lib/intelligence/contract';
import type { IntelligenceEditorialData, IntelligenceFront } from '@/types/intelligence-editorial';
import type {
  TechnologyLibraryData,
  TechnologyLibraryEntry,
  TechnologyLibraryStatus,
} from '@/types/technology-library';

import styles from './ProfessionalV2.module.scss';

const FRONT_LABELS: Record<IntelligenceFront, string> = {
  ia: 'IA',
  carrera: 'Carrera',
  tecnologia: 'Tecnología',
  pas: 'PAS',
};

const TECHNOLOGY_STATUS_LABELS: Record<TechnologyLibraryStatus, string> = {
  CURRENT_STACK: 'Ya lo usás',
  ASSESS_NOW: 'Evaluar ahora',
  WATCH: 'Seguir de cerca',
  REFERENCE: 'Referencia',
  HOLD: 'Esperar',
  ARCHIVED: 'Archivado',
};

function TechnologyEntry({ entry }: { entry: TechnologyLibraryEntry }) {
  return (
    <article className={styles['library-tech-entry']}>
      <div className={styles['library-row-head']}>
        <h4>{entry.name}</h4>
        <span>{TECHNOLOGY_STATUS_LABELS[entry.status]}</span>
      </div>
      <p>{entry.summary}</p>
      <details className={styles['library-details']}>
        <summary>Ver contexto</summary>
        <div className={styles['library-details-body']}>
          <p>
            <strong>Aplicación:</strong> {entry.application}
          </p>
          <p>
            <strong>Beneficio:</strong> {entry.benefit}
          </p>
          <p>
            <strong>Cuidado:</strong> {entry.caution}
          </p>
          <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={13} aria-hidden="true" /> {entry.repository}
          </a>
        </div>
      </details>
    </article>
  );
}

export function ProfessionalLibrary({
  editorial,
  technologyLibrary,
}: {
  editorial: IntelligenceEditorialData;
  technologyLibrary: TechnologyLibraryData;
}) {
  const editorialSnapshot =
    editorial.status === 'ready' && editorial.snapshot ? editorial.snapshot : null;
  const technologySnapshot =
    technologyLibrary.status === 'ready' && technologyLibrary.snapshot
      ? technologyLibrary.snapshot
      : null;

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

  const allTechnologyEntries = technologySnapshot
    ? technologySnapshot.categories.flatMap((category) => category.entries)
    : [];
  const technologyById = new Map(allTechnologyEntries.map((entry) => [entry.id, entry]));
  const spotlights = technologySnapshot
    ? technologySnapshot.spotlightIds
        .flatMap((id) => {
          const entry = technologyById.get(id);
          return entry ? [entry] : [];
        })
        .slice(0, 6)
    : [];

  return (
    <div className={styles.library}>
      <section className={styles['library-hero']} aria-labelledby="professional-library-title">
        <p className={styles.eyebrow}>Biblioteca profesional</p>
        <h2 id="professional-library-title">Guardado no significa pendiente</h2>
        <p>
          Acá viven explicaciones y referencias que pueden ser útiles más adelante. No hay backlog,
          streak, artículos sin leer ni obligación de “ponerse al día”.
        </p>
        <div className={styles['library-meta']}>
          <span>{editorialSnapshot?.archive.length ?? 0} artículos históricos</span>
          <span>{technologySnapshot?.totalEntries ?? 0} referencias tecnológicas</span>
        </div>
      </section>

      <section className={styles['library-section']} aria-labelledby="library-deep-dives-title">
        <div className={styles['library-heading']}>
          <p className={styles.eyebrow}>Deep dives profesionales</p>
          <h3 id="library-deep-dives-title">Explicaciones conectadas con tu perfil</h3>
          <p>
            Son artículos históricos que el índice canónico relaciona explícitamente con una
            prioridad o tecnología profesional.
          </p>
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
            <p>
              Mantienen sus URLs históricas de Intelligence. Biblioteca las reúne; no las convierte
              en estado profesional actual.
            </p>
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

      <section className={styles['library-section']} aria-labelledby="library-technology-title">
        <div className={styles['library-heading']}>
          <p className={styles.eyebrow}>Tecnología y referencias</p>
          <h3 id="library-technology-title">Opciones guardadas para el problema correcto</h3>
          <p>
            Una referencia guardada no implica instalarla, pagarla ni aprenderla. Antes de usarla,
            el PAS vuelve a verificar mantenimiento, licencia, seguridad, solapamiento y costo.
          </p>
        </div>

        {technologyLibrary.notice ? (
          <div
            className={styles.notice}
            data-tone={technologyLibrary.stale ? 'warning' : 'info'}
            role="status"
          >
            {technologyLibrary.stale ? (
              <CircleAlert size={16} aria-hidden="true" />
            ) : (
              <Info size={16} aria-hidden="true" />
            )}
            <span>{technologyLibrary.notice}</span>
          </div>
        ) : null}

        {technologySnapshot ? (
          <>
            <div className={styles['library-tech-grid']}>
              {spotlights.map((entry) => (
                <TechnologyEntry entry={entry} key={entry.id} />
              ))}
            </div>

            <details className={styles['library-all']}>
              <summary>Explorar biblioteca completa ({technologySnapshot.totalEntries})</summary>
              <div className={styles['library-category-list']}>
                {technologySnapshot.categories.map((category) => (
                  <details className={styles['library-category']} key={category.id}>
                    <summary>
                      <span>{category.label}</span>
                      <span>{category.entries.length}</span>
                    </summary>
                    <div className={styles['library-tech-grid']}>
                      {category.entries.map((entry) => (
                        <TechnologyEntry entry={entry} key={entry.id} />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          </>
        ) : (
          <div className={styles.notice} data-tone="warning" role="status">
            <CircleAlert size={16} aria-hidden="true" />
            <span>
              {technologyLibrary.notice ?? 'La biblioteca tecnológica no está disponible.'}
            </span>
          </div>
        )}
      </section>

      <footer className={styles['library-provenance']}>
        {editorialSnapshot ? (
          <>
            Editorial <code>{editorialSnapshot.source.commit.slice(0, 8)}</code>
          </>
        ) : (
          'Editorial no disponible'
        )}
        {' · '}
        {technologySnapshot ? (
          <>
            Tecnología <code>{technologySnapshot.source.commit.slice(0, 8)}</code>
          </>
        ) : (
          'Tecnología no disponible'
        )}
      </footer>
    </div>
  );
}
