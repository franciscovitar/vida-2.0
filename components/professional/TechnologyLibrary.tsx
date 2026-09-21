import { Boxes, ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type {
  TechnologyLibraryData,
  TechnologyLibraryEntry,
  TechnologyLibraryStatus,
} from '@/types/technology-library';

import styles from './ProfessionalDashboard.module.scss';

const STATUS_LABELS: Record<TechnologyLibraryStatus, string> = {
  CURRENT_STACK: 'Ya lo usás',
  ASSESS_NOW: 'Vale la pena evaluar',
  WATCH: 'Seguir de cerca',
  REFERENCE: 'Guardado como referencia',
  HOLD: 'Esperar por ahora',
  ARCHIVED: 'Archivado',
};

function EntryDetails({ entry }: { entry: TechnologyLibraryEntry }) {
  return (
    <details className={styles.more}>
      <summary>Ver más</summary>
      <div className={styles['more-body']}>
        <p>
          <strong>Cómo podría aplicarse a lo que ya usás:</strong> {entry.application}
        </p>
        <p>
          <strong>Beneficio posible:</strong> {entry.benefit}
        </p>
        <p>
          <strong>A tener en cuenta:</strong> {entry.caution}
        </p>
        <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={13} aria-hidden="true" /> {entry.repository}
        </a>
      </div>
    </details>
  );
}

function TechnologyEntryCard({ entry }: { entry: TechnologyLibraryEntry }) {
  return (
    <article className={styles['library-entry']}>
      <div className={styles['item-head']}>
        <strong>{entry.name}</strong>
        <Badge
          domain={entry.status === 'HOLD' || entry.status === 'REFERENCE' ? 'neutral' : 'productivity'}
          variant="outline"
        >
          {STATUS_LABELS[entry.status]}
        </Badge>
      </div>
      <p>{entry.summary}</p>
      <EntryDetails entry={entry} />
    </article>
  );
}

export function TechnologyLibrary({ data }: { data: TechnologyLibraryData }) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <Card aria-labelledby="technology-library-title">
        <SectionHeader
          id="technology-library-title"
          title="Biblioteca tecnológica"
          description="Referencias útiles para recuperar cuando aparezca el problema correcto."
          icon={Boxes}
          domain="productivity"
        />
        <p className={styles['library-unavailable']}>
          {data.notice ?? 'Biblioteca temporalmente no disponible.'}
        </p>
      </Card>
    );
  }

  const snapshot = data.snapshot;
  const entries = snapshot.categories.flatMap((category) => category.entries);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const spotlights = snapshot.spotlightIds.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });

  return (
    <Card aria-labelledby="technology-library-title">
      <SectionHeader
        id="technology-library-title"
        title="Biblioteca de herramientas, repos y tecnología"
        description="No son 193 cosas para aprender. Son opciones y referencias guardadas para no empezar de cero cuando aparezca una necesidad."
        icon={Boxes}
        domain="productivity"
      />

      {data.notice ? <p className={styles['library-notice']}>{data.notice}</p> : null}

      <div className={styles['library-summary']}>
        <strong>{snapshot.totalEntries} recursos curados</strong>
        <span>{snapshot.categories.length} categorías · {spotlights.length} destacadas ahora</span>
      </div>

      <section className={styles['library-section']} aria-labelledby="technology-spotlight-title">
        <div className={styles['subsection-head']}>
          <div>
            <h3 id="technology-spotlight-title">Destacadas ahora</h3>
            <p>
              Tienen una posibilidad razonable de servirte pronto. Guardado no significa instalado,
              adoptado ni que tengas que aprenderlo.
            </p>
          </div>
        </div>
        <div className={styles['library-grid']}>
          {spotlights.map((entry) => (
            <TechnologyEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      <details className={styles['library-all']}>
        <summary>Ver biblioteca completa ({snapshot.totalEntries})</summary>
        <div className={styles['library-all-body']}>
          {snapshot.categories.map((category) => (
            <details className={styles['library-category']} key={category.id}>
              <summary>
                <span>{category.label}</span>
                <span>{category.entries.length}</span>
              </summary>
              <div className={styles['library-grid']}>
                {category.entries.map((entry) => (
                  <TechnologyEntryCard key={entry.id} entry={entry} />
                ))}
              </div>
            </details>
          ))}
        </div>
      </details>

      <p className={styles['library-footnote']}>
        Antes de usar, instalar o copiar código de cualquier recurso, el PAS vuelve a verificar
        mantenimiento, licencia, seguridad, solapamiento con tu stack y costo operativo.
      </p>

      <footer className={styles['library-provenance']}>
        PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · biblioteca observada{' '}
        {snapshot.source.observedAt}
      </footer>
    </Card>
  );
}
