import { BookOpen, CircleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import styles from '@/components/intelligence/IntelligenceDashboard.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getIntelligenceArchiveData } from '@/lib/data/intelligence-source';
import { intelligenceArticleHref } from '@/lib/intelligence/contract';
import type { IntelligenceFront } from '@/types/intelligence-editorial';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Archivo · Inteligencia' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FRONT_LABELS: Record<IntelligenceFront, string> = {
  ia: 'IA esta semana',
  carrera: 'Carrera & futuro',
  tecnologia: 'Tecnología explicada',
  pas: 'Tu PAS',
};

export default async function InteligenciaArchivoPage() {
  const editorial = await getIntelligenceArchiveData();

  if (editorial.status !== 'ready' || !editorial.snapshot) {
    return (
      <div className={pageStyles.page}>
        <PageHeader
          title="Archivo"
          description="Biblioteca editorial de Inteligencia."
          icon={BookOpen}
          domain="productivity"
        />
        <Card aria-labelledby="intelligence-archive-unavailable-title">
          <SectionHeader
            id="intelligence-archive-unavailable-title"
            title="Archivo no disponible"
            description="La biblioteca falla cerrado si falta o es inválido su índice canónico."
            icon={CircleAlert}
            domain="productivity"
          />
          <div className={styles.notice} data-tone="warning" role="status">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{editorial.notice ?? 'Índice editorial no disponible.'}</span>
          </div>
        </Card>
      </div>
    );
  }

  const articles = [...editorial.snapshot.archive].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Archivo"
        description="Una biblioteca para volver cuando quieras. No hay artículos pendientes ni deuda de lectura."
        icon={BookOpen}
        domain="productivity"
      />

      <div className={styles.stack}>
        <div className={styles['cover-intro']}>
          <p>Lo anterior queda; no se convierte en una tarea.</p>
          <span>
            La portada muestra lo actual. Acá simplemente podés volver a una explicación anterior.
          </span>
        </div>

        <ul className={styles['archive-list']}>
          {articles.map((article) => (
            <li className={styles['archive-item']} key={article.id}>
              <div className={styles['archive-item-meta']}>
                <span>{FRONT_LABELS[article.front]}</span>
                <span>{article.readingMinutes} min</span>
                <span>{article.publishedAt}</span>
              </div>
              <h2>{article.title}</h2>
              <p>{article.dek}</p>
              <Link className={styles['article-link']} href={intelligenceArticleHref(article)}>
                Leer →
              </Link>
            </li>
          ))}
        </ul>

        <Link className={styles['article-link']} href="/inteligencia">
          ← Volver a la portada
        </Link>
      </div>
    </div>
  );
}
