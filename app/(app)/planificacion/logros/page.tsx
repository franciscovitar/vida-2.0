import { Trophy } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getAchievementsView } from '@/lib/data/achievements-source';

import pageStyles from '../../page.module.scss';
import styles from './page.module.scss';

export const metadata: Metadata = { title: 'Mis logros' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATEGORY: Record<string, string> = {
  ACADEMIC: 'Facultad',
  PROJECT: 'Proyectos',
  PROFESSIONAL: 'Trabajo',
  PERSONAL: 'Personal',
  OTHER: 'Otros',
};

export default async function LogrosPage() {
  await requireAuthorizedSession();
  const view = await getAchievementsView();
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Mis logros"
        description="Lo que conseguiste, no solamente lo que falta por hacer."
        icon={Trophy}
        domain="productivity"
      />
      <Card>
        <SectionHeader
          title="Resultados importantes"
          description="Momentos importantes y sus historias, desde una fuente privada autorizada."
          icon={Trophy}
          domain="productivity"
        />
        {view.state === 'not-configured' ? (
          <p role="status">Logros todavía no está conectado a una fuente privada autorizada.</p>
        ) : view.state === 'unavailable' ? (
          <p role="status">No se pudo consultar Logros. No mostramos resultados sin verificar.</p>
        ) : (
          <>
            {view.state === 'degraded' ? (
              <p role="status">
                La lectura fue parcial o contiene registros inconsistentes. Algunos logros no se
                muestran.
              </p>
            ) : null}
            {view.items.length === 0 ? (
              <p role="status">Todavía no hay logros aceptados para mostrar.</p>
            ) : (
              <ul className={styles.list}>
                {view.items.map((item) => (
                  <li
                    key={[item.category, item.title, item.occurredOn ?? ''].join(':')}
                    className={styles.item}
                  >
                    <strong>{item.title}</strong>
                    <p className={styles.meta}>
                      {CATEGORY[item.category]} ·{' '}
                      {item.occurredOn ? (
                        <time dateTime={item.occurredOn}>{item.occurredOn}</time>
                      ) : (
                        'Fecha no verificada'
                      )}
                    </p>
                    {item.story ? <p className={styles.story}>{item.story}</p> : null}
                    <p className={styles.meta}>{item.evidenceLabel}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
