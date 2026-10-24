'use client';

import { useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';

import type { Library360Area, Library360Data } from '@/types/library-360';
import type { TechnologyLibraryStatus } from '@/types/technology-library';
import {
  searchLibrary360Entries,
  selectLibrary360Entries,
  type Library360ViewEntry,
} from '@/lib/professional/library-360-view';

import styles from './Library360.module.scss';

const INITIAL_RESULT_LIMIT = 80;

const LABELS: Record<TechnologyLibraryStatus, string> = {
  CURRENT_STACK: 'Ya lo usás',
  ASSESS_NOW: 'Vale la pena evaluar',
  WATCH: 'Seguir de cerca',
  REFERENCE: 'Referencia guardada',
  HOLD: 'Pendiente de verificación',
  ARCHIVED: 'Histórico',
};

function ResearchLink({ area, commit }: { area: Library360Area; commit: string }) {
  const href =
    'https://github.com/franciscovitar/personal-ai-system/blob/' +
    commit +
    '/' +
    area.researchReportPath;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      Abrir informe G documental (PAS privado) <ExternalLink size={12} aria-hidden="true" />
      <span className={styles['sr-only']}> de {area.label}; requiere acceso a GitHub privado</span>
    </a>
  );
}

function EntryCard({ viewEntry }: { viewEntry: Library360ViewEntry }) {
  const { entry, primaryArea, relatedAreas } = viewEntry;
  return (
    <article className={styles.entry}>
      <div className={styles['entry-head']}>
        <h4>{entry.name}</h4>
        <span>{LABELS[entry.status]}</span>
      </div>
      <p>{entry.summary}</p>
      <p className={styles.facet}>
        Tipo: {entry.kind} · Área principal: {primaryArea.label}
      </p>
      {relatedAreas.length > 0 ? (
        <p className={styles.facet}>
          También relacionado con: {relatedAreas.map((area) => area.label).join(', ')}
        </p>
      ) : null}
      <p className={styles.facet}>Etiquetas: {entry.tags.join(', ')}</p>
      <details className={styles.details}>
        <summary>Ver contexto y fuentes</summary>
        <div className={styles['details-body']}>
          <p>
            <strong>Aplicación:</strong> {entry.application}
          </p>
          <p>
            <strong>Beneficio:</strong> {entry.benefit}
          </p>
          <p>
            <strong>Precaución:</strong> {entry.caution}
          </p>
          <p className={styles.facet}>Clasificación A01–A12 provisional · ID {entry.id}</p>
          {entry.sourceReferences.map((reference) => (
            <a
              href={reference.url}
              key={`${reference.url}-${reference.verifiedAt}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {reference.label} · verificada {reference.verifiedAt}{' '}
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          ))}
        </div>
      </details>
    </article>
  );
}

export function UnifiedLibrary360({ data }: { data: Library360Data }) {
  const [selectedAreaId, setSelectedAreaId] = useState('ALL');
  const [query, setQuery] = useState('');
  const [resultLimit, setResultLimit] = useState(INITIAL_RESULT_LIMIT);

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
  const matching = searchLibrary360Entries(selectLibrary360Entries(areas, selectedAreaId), query);
  const visible = matching.slice(0, resultLimit);

  return (
    <section aria-labelledby="library360-title" className={styles.section}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Inteligencia tecnológica · PAS</p>
        <h3 id="library360-title">Una biblioteca, doce áreas</h3>
        <p>
          {snapshot.totalEntries} recursos existentes, sin duplicados, más investigación documental
          en las doce áreas. Guardar una herramienta no implica adoptarla.
        </p>
        {data.notice ? (
          <p className={styles.notice} role="status">
            {data.notice}
          </p>
        ) : null}
      </header>

      <div className={styles.areas} role="group" aria-label="Filtrar biblioteca por área">
        <button
          type="button"
          className={styles['area-button']}
          aria-pressed={selectedAreaId === 'ALL'}
          onClick={() => {
            setSelectedAreaId('ALL');
            setResultLimit(INITIAL_RESULT_LIMIT);
          }}
        >
          Todas · {snapshot.totalEntries}
        </button>
        {areas.map((area) => (
          <button
            key={area.id}
            type="button"
            className={styles['area-button']}
            aria-pressed={selectedAreaId === area.id}
            onClick={() => {
              setSelectedAreaId(area.id);
              setResultLimit(INITIAL_RESULT_LIMIT);
            }}
          >
            {area.code} {area.label} · {selectLibrary360Entries(areas, area.id).length}
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
          <p>Los informes están en el repositorio privado PAS y requieren acceso a GitHub.</p>
          <ResearchLink area={selectedArea} commit={snapshot.source.commit} />
        </aside>
      ) : (
        <details className={styles.research}>
          <summary>Explorar los 12 informes de investigación</summary>
          <div className={styles['research-grid']}>
            {areas.map((area) => (
              <div key={area.id} className={styles['research-item']}>
                <span>
                  {area.code} · {area.label}
                </span>
                <ResearchLink area={area} commit={snapshot.source.commit} />
              </div>
            ))}
          </div>
          <p>Los informes están en el repositorio privado PAS y requieren acceso a GitHub.</p>
        </details>
      )}

      <div className={styles['search-row']}>
        <label htmlFor="library360-search">
          <Search size={16} aria-hidden="true" /> Buscar recursos
        </label>
        <input
          id="library360-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResultLimit(INITIAL_RESULT_LIMIT);
          }}
          type="search"
          placeholder="Nombre, tecnología, función o etiqueta"
          autoComplete="off"
        />
      </div>
      <p className={styles.count} role="status">
        Mostrando {visible.length} de {matching.length} coincidencias
      </p>

      {visible.length === 0 ? (
        <p className={styles.empty}>
          {query.trim()
            ? 'No encontramos fichas con esa búsqueda. Probá otros términos.'
            : 'Esta área ya tiene investigación documental, pero todavía no hay fichas dedicadas del catálogo anterior.'}
        </p>
      ) : (
        <div className={styles.grid}>
          {visible.map((viewEntry) => (
            <EntryCard viewEntry={viewEntry} key={viewEntry.entry.id} />
          ))}
        </div>
      )}

      {visible.length < matching.length ? (
        <button
          type="button"
          className={styles['area-button']}
          onClick={() => setResultLimit((current) => current + INITIAL_RESULT_LIMIT)}
        >
          Mostrar {Math.min(INITIAL_RESULT_LIMIT, matching.length - visible.length)} más
        </button>
      ) : null}

      <footer className={styles.provenance}>
        <p>
          Fuente: PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · clasificación propuesta
          del 24/10/2026 · contenido tecnológico observado {snapshot.source.observedAt}.
        </p>
        <p>
          La clasificación sigue en revisión. Los planes, precios, derechos y versiones deben
          revalidarse antes de utilizar cualquier recurso.
        </p>
      </footer>
    </section>
  );
}
