import { BookOpen, Brain, CircleAlert, Info, LineChart, Workflow } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FRONTS, intelligenceArticleHref } from '@/lib/intelligence/contract';
import type {
  IntelligenceArticleSummary,
  IntelligenceEditorialData,
  IntelligenceFront,
} from '@/types/intelligence-editorial';

import styles from './IntelligenceDashboard.module.scss';

const FRONT_META: Record<
  IntelligenceFront,
  { label: string; eyebrow: string; icon: typeof Brain }
> = {
  ia: { label: 'IA esta semana', eyebrow: 'Qué está cambiando', icon: Brain },
  carrera: { label: 'Carrera & futuro', eyebrow: 'Por qué aparece en tu radar', icon: BookOpen },
  tecnologia: {
    label: 'Tecnología explicada',
    eyebrow: 'Entender antes de adoptar',
    icon: Workflow,
  },
  pas: { label: 'Tu PAS', eyebrow: 'Qué mejoró y qué vas a notar', icon: LineChart },
};

function currentArticles(data: IntelligenceEditorialData): IntelligenceArticleSummary[] {
  if (data.status !== 'ready' || !data.snapshot) return [];

  return FRONTS.flatMap((front) => {
    const id = data.snapshot?.current[front];
    const article = data.snapshot?.archive.find((item) => item.id === id);
    return article ? [article] : [];
  });
}

function specialArticles(data: IntelligenceEditorialData): IntelligenceArticleSummary[] {
  if (data.status !== 'ready' || !data.snapshot) return [];

  return data.snapshot.specials.flatMap((id) => {
    const article = data.snapshot?.archive.find((item) => item.id === id);
    return article ? [article] : [];
  });
}

export function IntelligenceDashboard({ editorial }: { editorial: IntelligenceEditorialData }) {
  if (editorial.status !== 'ready' || !editorial.snapshot) {
    return (
      <Card aria-labelledby="intelligence-unavailable-title">
        <SectionHeader
          id="intelligence-unavailable-title"
          title="Inteligencia"
          description="La revista falla cerrado: no inventa artículos si falta o es inválido el índice editorial."
          icon={CircleAlert}
          domain="productivity"
        />
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{editorial.notice ?? 'Índice editorial no disponible.'}</span>
        </div>
      </Card>
    );
  }

  const articles = currentArticles(editorial);
  const specials = specialArticles(editorial);

  return (
    <div className={styles.stack}>
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

      <div className={styles['cover-intro']}>
        <p>Acá entendés qué está cambiando.</p>
        <span>
          Para decidir qué hacer ahora, está <Link href="/professional">Profesional</Link>.
        </span>
      </div>

      <div className={styles['cover-grid']}>
        {articles.map((article) => {
          const meta = FRONT_META[article.front];
          const Icon = meta.icon;

          return (
            <Card as="article" className={styles['cover-card']} key={article.id}>
              <div className={styles['front-meta']}>
                <span className={styles['front-label']}>
                  <Icon size={15} aria-hidden="true" />
                  {meta.label}
                </span>
                <span>{article.readingMinutes} min</span>
              </div>
              <p className={styles.eyebrow}>{meta.eyebrow}</p>
              <h2>{article.title}</h2>
              <p className={styles.dek}>{article.dek}</p>
              <Link className={styles['read-link']} href={intelligenceArticleHref(article)}>
                Leer artículo →
              </Link>
            </Card>
          );
        })}
      </div>

      {specials.length > 0 ? (
        <section
          className={styles['specials-section']}
          aria-labelledby="intelligence-specials-title"
        >
          <div className={styles['specials-heading']}>
            <div>
              <strong id="intelligence-specials-title">Especiales recientes</strong>
              <p>
                Sólo aparecen cuando una señal merece explicación propia. No reemplazan las cuatro
                tapas ni crean pendientes.
              </p>
            </div>
          </div>

          <div className={styles['specials-grid']}>
            {specials.map((article) => {
              const meta = FRONT_META[article.front];
              const Icon = meta.icon;

              return (
                <Card as="article" className={styles['special-card']} key={article.id}>
                  <div className={styles['front-meta']}>
                    <span className={styles['front-label']}>
                      <Icon size={15} aria-hidden="true" />
                      Especial · {meta.label}
                    </span>
                    <span>{article.readingMinutes} min</span>
                  </div>
                  <h2>{article.title}</h2>
                  <p className={styles.dek}>{article.dek}</p>
                  <Link className={styles['read-link']} href={intelligenceArticleHref(article)}>
                    Leer especial →
                  </Link>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className={styles['archive-row']}>
        <div>
          <strong>Archivo editorial</strong>
          <p>
            Lo anterior queda disponible como biblioteca. No hay pendientes ni deuda de lectura.
          </p>
        </div>
        <Link className={styles['archive-link']} href="/inteligencia/archivo">
          Abrir archivo →
        </Link>
      </div>

      <footer className={styles.provenance}>
        <span>
          PAS <code>{editorial.snapshot.source.commit.slice(0, 8)}</code> · observado{' '}
          {editorial.snapshot.source.observedAt}
        </span>
        <span>{editorial.stale ? 'necesita refresh' : 'vigente'}</span>
      </footer>
    </div>
  );
}
