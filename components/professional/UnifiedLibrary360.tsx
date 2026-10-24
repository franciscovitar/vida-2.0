'use client';

import { useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';

import type { Library360Area, Library360Data, Library360MentionAudit } from '@/types/library-360';
import type { TechnologyLibraryStatus } from '@/types/technology-library';
import {
  searchLibrary360Entries,
  searchLibrary360Results,
  selectLibrary360Entries,
  selectLibrary360Results,
  type Library360Result,
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

function EntryCard({ viewEntry, commit }: { viewEntry: Library360ViewEntry; commit: string }) {
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
          {entry.researchMentionRefs?.length ? (
            <>
              <p className={styles.facet}>
                {entry.researchMentionRefs.length} menciones de investigación vinculadas a esta
                misma ficha; identidad TL conservada.
              </p>
              {entry.researchMentionRefs.map((reference) => (
                <a
                  key={reference.sourceId}
                  href={`https://github.com/franciscovitar/personal-ai-system/blob/${commit}/${reference.sourcePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Mención PAS {reference.sourceId} · verificada {reference.sourceCheckedAt}{' '}
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ))}
            </>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function ResearchCaseCard({
  item,
  commit,
}: {
  item: Extract<Library360Result, { kind: 'case' }>['value'];
  commit: string;
}) {
  const sourceHref = `https://github.com/franciscovitar/personal-ai-system/blob/${commit}/${item.sourcePath}`;
  return (
    <article className={styles.entry}>
      <div className={styles['entry-head']}>
        <h4>{item.title}</h4>
        <span>Investigación documental · prueba no ejecutada</span>
      </div>
      <p>{item.topic}</p>
      {item.alternatives ? (
        <p>
          <strong>Alternativas analizadas:</strong> {item.alternatives}
        </p>
      ) : null}
      {item.noChange ? (
        <p>
          <strong>Sin cambio:</strong> {item.noChange}
        </p>
      ) : null}
      {item.limitations ? (
        <p>
          <strong>Límites y derechos:</strong> {item.limitations}
        </p>
      ) : null}
      {item.trialPlan ? (
        <p>
          <strong>Posible prueba:</strong> {item.trialPlan}
        </p>
      ) : null}
      <p className={styles.facet}>
        Caso {item.id} · adopción no autorizada · decisión: {item.decision ?? 'solo documentación'}
      </p>
      <a href={sourceHref} target="_blank" rel="noopener noreferrer">
        Abrir registro fuente PAS (privado) <ExternalLink size={12} aria-hidden="true" />
        <span className={styles['sr-only']}> requiere acceso a GitHub privado</span>
      </a>
      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
        Fuente citada <ExternalLink size={12} aria-hidden="true" />
      </a>
    </article>
  );
}

function CandidateCard({
  item,
  commit,
}: {
  item: Extract<Library360Result, { kind: 'candidate' }>['value'];
  commit: string;
}) {
  const sourceHref = `https://github.com/franciscovitar/personal-ai-system/blob/${commit}/${item.sourcePath}`;
  return (
    <article className={styles.entry}>
      <div className={styles['entry-head']}>
        <h4>{item.name}</h4>
        <span>Descubrimiento · verificar antes de recomendar</span>
      </div>
      <p>
        Identidad provisional: {item.identity} · ámbito: {item.sourceScope}
      </p>
      <p>
        Derechos: {item.rightsStatus}. Prueba: {item.testStatus}. Adopción: no autorizada.
      </p>
      <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer">
        Abrir referencia pública <ExternalLink size={12} aria-hidden="true" />
      </a>
      <a href={sourceHref} target="_blank" rel="noopener noreferrer">
        Abrir triage fuente PAS (privado) <ExternalLink size={12} aria-hidden="true" />
        <span className={styles['sr-only']}> requiere acceso a GitHub privado</span>
      </a>
      <p className={styles.facet}>
        Referencia {item.id} · fuente PAS verificada {item.sourceCheckedAt}
      </p>
    </article>
  );
}

function HoldCard({ item, commit }: { item: Library360MentionAudit; commit: string }) {
  const sourceHref = `https://github.com/franciscovitar/personal-ai-system/blob/${commit}/${item.sourcePath}`;
  return (
    <article className={styles.entry}>
      <div className={styles['entry-head']}>
        <h4>{item.name}</h4>
        <span>HOLD · identidad o alcance sin resolver</span>
      </div>
      <p>{item.reason.replaceAll('_', ' ').toLowerCase()}.</p>
      {item.identity ? <p>Identidad registrada: {item.identity}</p> : null}
      <a href={sourceHref} target="_blank" rel="noopener noreferrer">
        Abrir mención fuente PAS (privado) <ExternalLink size={12} aria-hidden="true" />
        <span className={styles['sr-only']}> requiere acceso a GitHub privado</span>
      </a>
      <p className={styles.facet}>Mención {item.id} · no se importó como ficha ni producto.</p>
    </article>
  );
}

function ResultCard({ result, commit }: { result: Library360Result; commit: string }) {
  if (result.kind === 'resource') return <EntryCard viewEntry={result.value} commit={commit} />;
  if (result.kind === 'case') return <ResearchCaseCard item={result.value} commit={commit} />;
  if (result.kind === 'candidate') return <CandidateCard item={result.value} commit={commit} />;
  return <HoldCard item={result.value} commit={commit} />;
}

export function UnifiedLibrary360({ data }: { data: Library360Data }) {
  const [selectedAreaId, setSelectedAreaId] = useState('ALL');
  const [selectedKind, setSelectedKind] = useState('ALL');
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
  const matching = searchLibrary360Results(
    selectLibrary360Results(snapshot, selectedAreaId, selectedKind),
    query,
  );
  const visible = matching.slice(0, resultLimit);
  const kindCounts = {
    ALL:
      searchLibrary360Entries(selectLibrary360Entries(areas, selectedAreaId), '').length +
      snapshot.researchCases.filter(
        (item) => selectedAreaId === 'ALL' || item.areaCode === selectedArea?.code,
      ).length +
      snapshot.candidateReferences.filter(
        (item) => selectedAreaId === 'ALL' || item.area === selectedArea?.code,
      ).length,
    resource: selectLibrary360Entries(areas, selectedAreaId).length,
    case: snapshot.researchCases.filter(
      (item) => selectedAreaId === 'ALL' || item.areaCode === selectedArea?.code,
    ).length,
    candidate: snapshot.candidateReferences.filter(
      (item) => selectedAreaId === 'ALL' || item.area === selectedArea?.code,
    ).length,
    hold: snapshot.researchMentionAudit.filter(
      (item) =>
        item.disposition === 'HOLD' &&
        (selectedAreaId === 'ALL' || item.area === selectedArea?.code),
    ).length,
  };

  return (
    <section aria-labelledby="library360-title" className={styles.section}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Inteligencia tecnológica · PAS</p>
        <h3 id="library360-title">Una biblioteca, doce áreas</h3>
        <p>
          {snapshot.totalEntries} fichas existentes, {snapshot.researchCases.length} casos
          documentales, {snapshot.candidateReferences.length} referencias candidatas pendientes y{' '}
          {kindCounts.hold} menciones en HOLD por conflictos reales. Guardar una referencia no
          implica probarla ni adoptarla.
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
          Todas · {kindCounts.ALL}
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
            {area.code} {area.label} · {selectLibrary360Results(snapshot, area.id).length}
          </button>
        ))}
      </div>

      <div
        className={styles.areas}
        role="group"
        aria-label="Filtrar biblioteca por tipo de contenido"
      >
        {(
          [
            ['ALL', 'Todo'],
            ['resource', 'Fichas'],
            ['case', 'Casos documentales'],
            ['candidate', 'Descubrimientos'],
            ['hold', 'HOLD'],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className={styles['area-button']}
            aria-pressed={selectedKind === kind}
            onClick={() => {
              setSelectedKind(kind);
              setResultLimit(INITIAL_RESULT_LIMIT);
            }}
          >
            {label} · {kindCounts[kind]}
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
          <Search size={16} aria-hidden="true" /> Buscar en fichas, casos y referencias
        </label>
        <input
          id="library360-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResultLimit(INITIAL_RESULT_LIMIT);
          }}
          type="search"
          placeholder="Nombre, caso, función, área, fuente o etiqueta"
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
            : 'No hay contenido de este tipo en el filtro seleccionado.'}
        </p>
      ) : (
        <div className={styles.grid}>
          {visible.map((result) => (
            <ResultCard
              result={result}
              commit={snapshot.source.commit}
              key={`${result.kind}-${result.id}`}
            />
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
          Fuente: PAS main <code>{snapshot.source.commit.slice(0, 8)}</code> · fichas TL y casos
          documentales versionados por archivo y hash.
        </p>
        <p>
          La clasificación sigue en revisión. Los planes, precios, derechos y versiones deben
          revalidarse antes de utilizar cualquier recurso.
        </p>
      </footer>
    </section>
  );
}
