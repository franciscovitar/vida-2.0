import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { searchWebCatalog } from '@/lib/web-catalog/service';

import pageStyles from '../page.module.scss';
import styles from './page.module.scss';

export const metadata: Metadata = {
  title: 'Buscar',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAuthorizedSession();

  if (!isWebCatalogEnabled()) notFound();

  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q : '';
  const result = await searchWebCatalog(query);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Buscar"
        description="Búsqueda sobre contenido autorizado del Registro Web."
        icon={Search}
        domain="neutral"
      />

      <Card>
        <form className={styles.form} method="get" action="/buscar">
          <label className={styles.label} htmlFor="q">
            Consulta
          </label>
          <div className={styles.row}>
            <input
              id="q"
              name="q"
              type="search"
              className={styles.input}
              defaultValue={query}
              placeholder="Título, sección o texto…"
              maxLength={100}
              autoComplete="off"
            />
            <button type="submit" className={styles.submit}>
              Buscar
            </button>
          </div>
        </form>
      </Card>

      {!result.ok ? (
        <p className={styles.note}>{result.message}</p>
      ) : query.trim() === '' ? (
        <p className={styles.note}>Escribí una consulta para buscar.</p>
      ) : result.hits.length === 0 ? (
        <p className={styles.note}>Sin resultados.</p>
      ) : (
        <ul className={styles.results}>
          {result.hits.map((hit) => (
            <li key={hit.href} className={styles.hit}>
              <a href={hit.href} className={styles['hit-title']}>
                {hit.title}
              </a>
              <p className={styles['hit-meta']}>{hit.sectionLabel}</p>
              {hit.snippet ? <p className={styles['hit-snippet']}>{hit.snippet}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
