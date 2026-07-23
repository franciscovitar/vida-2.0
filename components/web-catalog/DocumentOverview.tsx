import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import {
  buildDocumentOverview,
  type DocumentPresentation,
} from '@/lib/web-catalog/document-overview';
import type { ContentPage } from '@/types/content';

import styles from './DocumentOverview.module.scss';

function emphasisClass(emphasis: 'default' | 'strong' | 'muted'): string {
  if (emphasis === 'strong') return styles['card-strong'];
  if (emphasis === 'muted') return styles['card-muted'];
  return '';
}

export function DocumentOverview({
  page,
  presentation,
}: {
  page: ContentPage;
  presentation?: DocumentPresentation;
}) {
  const overview = buildDocumentOverview(page, presentation);
  if (!overview) return null;

  return (
    <section className={styles.overview} aria-label={`Resumen de ${page.title}`}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{overview.eyebrow}</p>
        <h2>{overview.title}</h2>
        {overview.description ? <p>{overview.description}</p> : null}
      </header>

      <div className={styles.grid} data-presentation={overview.presentation}>
        {overview.cards.map((item) => (
          <Card key={item.key} compact className={`${styles.card} ${emphasisClass(item.emphasis)}`}>
            <div className={styles['card-head']}>
              <h3>{item.title}</h3>
              {item.count !== null ? (
                <Badge domain={item.domain} variant="outline">
                  {item.count}
                </Badge>
              ) : null}
            </div>
            {item.description ? <p className={styles.description}>{item.description}</p> : null}
            {item.items.length > 0 ? (
              <ul>
                {item.items.map((text, index) => (
                  <li key={`${item.key}-${index}`}>{text}</li>
                ))}
              </ul>
            ) : item.description ? null : (
              <p className={styles.empty}>Sin ítems estructurados en esta sección.</p>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
