import { CircleAlert, Info } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { IntelligenceArticleData, IntelligenceFront } from '@/types/intelligence-editorial';

import styles from './IntelligenceDashboard.module.scss';

const FRONT_LABELS: Record<IntelligenceFront, string> = {
  ia: 'IA esta semana',
  carrera: 'Carrera & futuro',
  tecnologia: 'Tecnología explicada',
  pas: 'Tu PAS',
};

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

export function IntelligenceArticleView({ data }: { data: IntelligenceArticleData }) {
  if (data.status !== 'ready' || !data.article || !data.summary) {
    return (
      <Card aria-labelledby="intelligence-article-unavailable-title">
        <SectionHeader
          id="intelligence-article-unavailable-title"
          title="Artículo no disponible"
          description="Inteligencia falla cerrado: no reconstruye contenido si el derivado no coincide con su índice canónico."
          icon={CircleAlert}
          domain="productivity"
        />
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{data.notice ?? 'No pudimos cargar este artículo.'}</span>
        </div>
      </Card>
    );
  }

  const article = data.article;

  return (
    <article className={styles['article-shell']}>
      {data.notice ? (
        <div className={styles.notice} data-tone={data.stale ? 'warning' : 'info'} role="status">
          {data.stale ? (
            <CircleAlert size={16} aria-hidden="true" />
          ) : (
            <Info size={16} aria-hidden="true" />
          )}
          <span>{data.notice}</span>
        </div>
      ) : null}

      <header className={styles['article-header']}>
        <p className={styles['article-kicker']}>{FRONT_LABELS[article.front]}</p>
        <h1 className={styles['article-title']}>{article.title}</h1>
        <p className={styles['article-dek']}>{article.dek}</p>
        <div className={styles['article-meta']}>
          <span>{article.readingMinutes} min de lectura</span>
          <span>Publicado {formatDate(article.publishedAt)}</span>
          <span>Evidencia observada {formatDate(article.freshness.evidenceObservedAt)}</span>
        </div>
      </header>

      <div className={styles['article-body']}>
        {article.sections.map((section) => (
          <section className={styles['article-section']} key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>

      {article.professionalRefs.length > 0 ? (
        <aside className={styles['decision-card']}>
          <strong>La decisión actual vive en Profesional</strong>
          <p>
            Este artículo explica el contexto. Prioridad, estado y acción vigente se actualizan en
            la superficie ejecutiva.
          </p>
          <Link className={styles['article-link']} href="/professional">
            Ver Profesional →
          </Link>
        </aside>
      ) : null}

      <section className={styles['article-sources']} aria-labelledby="article-sources-title">
        <h2 id="article-sources-title">Fuentes y provenance</h2>
        <ul className={styles['source-list']}>
          {article.sources.map((source) => (
            <li key={source.ref ?? source.url ?? source.title}>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              ) : (
                <span>{source.title}</span>
              )}
              <small>
                {source.role}
                {source.ref ? ` · ${source.ref}` : ''} · observado {source.observedAt}
              </small>
            </li>
          ))}
        </ul>
      </section>

      <nav className={styles['back-links']} aria-label="Navegación editorial">
        <Link className={styles['article-link']} href="/inteligencia">
          ← Portada de Inteligencia
        </Link>
        <Link className={styles['article-link']} href="/inteligencia/archivo">
          Archivo →
        </Link>
      </nav>

      <footer className={styles.provenance}>
        <span>
          PAS <code>{article.source.commit.slice(0, 8)}</code>
        </span>
        <span>{data.stale ? 'requiere revalidación para decisiones actuales' : 'vigente'}</span>
      </footer>
    </article>
  );
}
