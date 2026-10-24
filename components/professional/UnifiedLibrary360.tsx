'use client';

import { useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';

import type { Library360Area, Library360Data, Library360Entry } from '@/types/library-360';
import type { TechnologyLibraryStatus } from '@/types/technology-library';

import styles from './Library360.module.scss';

const LABELS: Record<TechnologyLibraryStatus, string> = {
  CURRENT_STACK: 'Ya lo usás',
  ASSESS_NOW: 'Vale la pena evaluar',
  WATCH: 'Seguir de cerca',
  REFERENCE: 'Referencia guardada',
  HOLD: 'Pendiente de verificación',
  ARCHIVED: 'Histórico',
};

function normalized(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function ResearchLink({
  area,
  commit,
}: {
  area: Library360Area;
  commit: string;
}) {
  const href = 'https://github.com/franciscovitar/personal-ai-system/blob/' +
    commit + '/' + area.researchReportPath;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      Informe G documental <ExternalLink size={12} aria-hidden="true" />
      <span className={styles.srOnly}> de {area.label} (GitHub privado)</span>
    </a>
  );
}

function EntryCard({
  entry,
  relatedNames,
}: {
  entry: Library360Entry;
  relatedNames: readonly string[];
}) {
  return (
    <article className={styles.entry}>
      <div className={styles.entryHead}>
        <h4>{entry.name}</h4>
        <span>{LABELS[entry.status]}</span>
      </div>
      <p>{entry.summary}</p>
      {relatedNames.length > 0 ? (
        <p className={styles.facet}>
          También relacionado con: {relatedNames.join(', ')}
        </p>
      ) : null}
      <details className={styles.details}>
        <summary>Ver contexto y fuentes</summary>
        <div className={styles.detailsBody}>
          <p><strong>Aplicación:</strong> {entry.application}</p>
          <p><strong>Beneficio:</strong> {entry.benefit}</p>
          <p><strong>Precaución:</strong> {entry.caution}</p>
          <p className={styles.facet}>Clasificación A01–A12 provisional · ID {entry.id}</p>
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
            Fuente del recurso <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </details>
    </article>
  );
}

export function UnifiedLibrary360({ data }: { data: Library360Data }) {
  const [selectedAreaId, setSelectedAreaId] = useState('ALL');
  const [query, setQuery] = useState('');

  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section aria-labelledby="library360-title" className={styles.section}>
        <h3 id="library360-title">Biblioteca 360°</h3>
        <p role="status">{data.notice ?? 'No está disponible el catálogo unificado.'}</p>
      </section>
    );
  }

  const snapshot = data.snapshot;
  const areas = snapshot.areas;
  const selectedArea = areas.find((area) => area.id === selectedAreaId);
  const includedAreas = selectedArea ? [selectedArea] : areas;
  const labelsById = new Map(areas.map((area) => [area.id, area.label]));
  const terms = normalized(query.trim());
  const candidates = includedAreas.flatMap((area) => area.entries);
  const matching = candidates.filter((entry) => {
    if (!terms) return true;
    return normalized([
      entry.id, entry.name, entry.kind, entry.summary, entry.repository, ...entry.tags,
    ].join(' ')).includes(terms);
  });
  const visible = matching.slice(0, 80);

  return (
    <section aria-labelledby="library360-title" className={styles.section}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Inteligencia tecnológica · PAS</p>
        <h3 id="library360-title">Una biblioteca, doce áreas</h3>
        <p>
          {snapshot.totalEntries} recursos existentes, sin duplicados, más investigación documental
          en las doce áreas. Guardar una herramienta no implica adoptarla.
        </p>
        {data.notice ? <p className={styles.notice} role="status">{data.notice}</p> : null}
      </header>

      <div className={styles.areas} aria-label="Filtrar biblioteca por área">
        <button
          type="button"
          className={styles.areaButton}
          aria-pressed={selectedAreaId === 'ALL'}
          onClick={() => setSelectedAreaId('ALL')}
        >
          Todas · {snapshot.totalEntries}
        </button>
        {areas.map((area) => (
          <button
            key={area.id}
            type="button"
            className={styles.areaButton}
            aria-pressed={selectedAreaId === area.id}
            onClick={() => setSelectedAreaId(area.id)}
          >
            {area.code} {area.label} · {area.entries.length}
          </button>
        ))}
      </div>

      {selectedArea ? (
        <aside className={styles.research}>
          <strong>{selectedArea.label}</strong>
          <p>
            Su investigación G está disponible como referencia documental; sus resultados no
            equivalen a herramientas probadas ni a licencias comerciales aprobadas.
          </p>
          <ResearchLink area={selectedArea} commit={snapshot.source.commit} />
        </aside>
      ) : (
        <details className={styles.research}>
          <summary>Explorar los 12 informes de investigación</summary>
          <div className={styles.researchGrid}>
            {areas.map((area) => (
              <div key={area.id} className={styles.researchItem}>
                <span>{area.code} · {area.label}</span>
                <ResearchLink area={area} commit={snapshot.source.commit} />
              </div>
            ))}
          </div>
        </details>
      )}

      <div className={styles.searchRow}>
        <label htmlFor="library360-search"><Search size={16} aria-hidden="true" /> Buscar recursos</label>
        <input
          id="library360-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Nombre, tecnología, función o etiqueta"
          autoComplete="off"
        />
      </div>
      <p className={styles.count} role="status">
        {matching.length} coincidencias{matching.length > visible.length
          ? ' · mostrando las primeras 80; refiná la búsqueda' : ''}
      </p>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {terms
            ? 'No encontramos fichas con esa búsqueda. Probá otros términos.'
            : 'Esta área ya tiene investigación documental, pero todavía no hay fichas dedicadas del catálogo anterior.'}
        </p>
      ) : (
        <div className={styles.grid}>
          {visible.map((entry) => (
            <EntryCard
              entry={entry}
              key={entry.id}
              relatedNames={entry.relatedAreaIds.map((id) => labelsById.get(id) ?? id)}
            />
          ))}
        </div>
      )}

      <footer className={styles.provenance}>
        <p>
          Fuente: PAS <code>{snapshot.source.commit.slice(0, 8)}</code> ·
          clasificación propuesta del 24/10/2026 · contenido tecnológico observado{' '}
          {snapshot.source.observedAt}.
        </p>
        <p>
          La clasificación sigue en revisión. Los planes, precios, derechos y versiones deben
          revalidarse antes de utilizar cualquier recurso.
        </p>
      </footer>
    </section>
  );
}
