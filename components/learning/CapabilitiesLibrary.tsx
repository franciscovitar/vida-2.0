'use client';

import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/Card';
import type { CapabilityItem, CapabilityLibraryRead } from '@/lib/learning/capabilities-source';

import styles from './CapabilitiesLibrary.module.scss';

const AREAS = [
  'Habilidades',
  'Conocimientos',
  'Carácter',
  'Experiencias',
  'Presencia',
  'Recursos',
  'Relaciones',
];

function routeLabel(item: CapabilityItem): string {
  const labels: Record<string, string> = {
    GENERALIST_ONLY: 'Biblioteca generalista',
    PROFESSIONAL: 'Proyecto profesional correspondiente',
    WORLD: 'Proyecto relacionado con el mundo y la vida diaria',
    INTELLIGENCE: 'Proyecto de inteligencia correspondiente',
  };
  const primary = item.primaryRoute
    ? (labels[item.primaryRoute] ?? 'Proyecto correspondiente')
    : 'Sin ruta indicada';
  return item.learningRoute
    ? `${primary}. Si pedís aprenderlo: Learning OS, solo con solicitud explícita.`
    : primary;
}

function hoursLabel(item: CapabilityItem): string {
  if (!item.genericHours.length) return 'Sin estimación disponible';
  const confidence =
    item.timeConfidence === 'LOW'
      ? 'confianza baja'
      : item.timeConfidence === 'HIGH'
        ? 'confianza alta'
        : 'confianza media';
  return `Horas genéricas acumuladas por nivel: ${item.genericHours.join(' / ')} · ${confidence}. No estima tu tiempo personal.`;
}

function CapabilityDetails({ item }: { item: CapabilityItem }) {
  if (!item.card) {
    return (
      <div className={styles.discovery}>
        <p>
          Esta capacidad aparece en el inventario. Su ficha completa todavía no está curada; acá se
          muestra únicamente la información que existe.
        </p>
        <dl>
          <div>
            <dt>Área</dt>
            <dd>{item.area}</dd>
          </div>
          <div>
            <dt>Referencia de tiempo</dt>
            <dd>{hoursLabel(item)}</dd>
          </div>
          <div>
            <dt>Ruta si después pedís aprenderla</dt>
            <dd>{routeLabel(item)}</dd>
          </div>
        </dl>
      </div>
    );
  }
  return (
    <div className={styles.details}>
      <p className={styles.outcome}>{item.card.whatYouGet}</p>
      <h4>Beneficios concretos</h4>
      <ul>
        {item.card.benefits.map((benefit) => (
          <li key={benefit}>{benefit}</li>
        ))}
      </ul>
      {item.card.relatedBenefits.length ? (
        <>
          <h4>También puede ayudar con</h4>
          <ul>
            {item.card.relatedBenefits.map((benefit) => (
              <li key={`${benefit.area}:${benefit.how}`}>
                <strong>{benefit.area}:</strong> {benefit.how} ({benefit.evidence})
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <dl>
        <div>
          <dt>Cómo se siente alcanzar el nivel</dt>
          <dd>{item.card.targetFeel}</dd>
        </div>
        <div>
          <dt>Cómo suele sentirse aprenderlo</dt>
          <dd>{item.card.learningFeel}</dd>
        </div>
        <div>
          <dt>Dificultad</dt>
          <dd>{item.card.difficulty}</dd>
        </div>
        <div>
          <dt>Fricciones habituales</dt>
          <dd>{item.card.friction}</dd>
        </div>
        <div>
          <dt>Qué hace falta</dt>
          <dd>{item.card.infrastructure}</dd>
        </div>
        <div>
          <dt>Mantenimiento</dt>
          <dd>{item.card.maintenance}</dd>
        </div>
        <div>
          <dt>Si nunca lo aprendés</dt>
          <dd>{item.card.ifNeverLearned}</dd>
        </div>
        <div>
          <dt>Referencia de tiempo</dt>
          <dd>{hoursLabel(item)}</dd>
        </div>
        <div>
          <dt>Ruta si después pedís aprenderla</dt>
          <dd>{routeLabel(item)}</dd>
        </div>
      </dl>
    </div>
  );
}

function CapabilityTile({ item, featured = false }: { item: CapabilityItem; featured?: boolean }) {
  return (
    <details className={styles.tile} open={featured || undefined}>
      <summary>
        <span className={styles.area}>{item.area}</span>
        <span className={styles.name}>{item.name}</span>
        {item.status === 'curated' ? <span className={styles.badge}>Ficha completa</span> : null}
      </summary>
      <CapabilityDetails item={item} />
    </details>
  );
}

export function CapabilitiesLibrary({ library }: { library: CapabilityLibraryRead }) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('Todas las áreas');
  const [includeUncurated, setIncludeUncurated] = useState(false);
  const curated = useMemo(
    () => library.items.filter((item) => item.status === 'curated'),
    [library],
  );
  const featured = library.initialIds
    .map((id) => curated.find((item) => item.id === id))
    .filter((item): item is CapabilityItem => Boolean(item));
  const featuredIds = new Set(library.initialIds);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    return library.items.filter((item) => {
      const inArea = area === 'Todas las áreas' || item.area === area;
      const inSelectedCollection = item.status === 'curated' || includeUncurated || Boolean(needle);
      return (
        inArea &&
        inSelectedCollection &&
        (!needle ||
          `${item.name} ${item.area} ${item.subcategory}`.toLocaleLowerCase('es').includes(needle))
      );
    });
  }, [area, includeUncurated, library.items, query]);
  const listedItems =
    !includeUncurated && !query.trim()
      ? filtered.filter((item) => !featuredIds.has(item.id))
      : filtered;

  if (library.status !== 'ready') {
    return (
      <Card>
        <p className={styles.notice}>{library.notice}</p>
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      <Card>
        <div className={styles.heading}>
          <div>
            <h2>Tres ideas para empezar a explorar</h2>
            <p>Son ejemplos de áreas distintas, sin orden de prioridad ni compromiso.</p>
          </div>
        </div>
        <div className={styles.featured}>
          {featured.map((item) => (
            <CapabilityTile key={item.id} item={item} featured />
          ))}
        </div>
      </Card>

      <Card>
        <div className={styles.heading}>
          <div>
            <h2>Biblioteca de capacidades</h2>
            <p>Explorá las fichas completas y el resto del inventario disponible.</p>
          </div>
          <span className={styles.count}>{library.items.length} capacidades</span>
        </div>
        <div className={styles.filters}>
          <label>
            <span>Buscar</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre o subárea"
            />
          </label>
          <label>
            <span>Área</span>
            <select value={area} onChange={(event) => setArea(event.target.value)}>
              <option>Todas las áreas</option>
              {AREAS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <label className={styles['include-discovery']}>
          <input
            type="checkbox"
            checked={includeUncurated}
            onChange={(event) => setIncludeUncurated(event.target.checked)}
          />
          <span>Incluir las capacidades que todavía no tienen ficha completa</span>
        </label>
        <p className={styles['result-count']}>
          {includeUncurated || query.trim()
            ? `${filtered.length} resultados`
            : `${curated.length} fichas completas en total`}
          {' · '}
          {library.items.length - curated.length} capacidades aún sin ficha completa
        </p>
        <div className={styles.list}>
          {listedItems.map((item) => (
            <CapabilityTile key={item.id} item={item} />
          ))}
        </div>
        {listedItems.length === 0 ? (
          <p className={styles.notice}>No hay capacidades que coincidan con esa búsqueda.</p>
        ) : null}
      </Card>

      <Card compact>
        <p className={styles.provenance}>
          Fuente privada: PAS main
          {library.sourceCommit ? ` · ${library.sourceCommit.slice(0, 12)}` : ''}
          {library.updated ? ` · datos actualizados ${library.updated}` : ''}. Las referencias de
          tiempo son genéricas; no estiman tu tiempo personal.
        </p>
      </Card>
    </div>
  );
}
