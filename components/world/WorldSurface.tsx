import { BookOpen, CircleAlert, Clock3, Info, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { listWorldItems, worldDomainLabel, worldPieceHref } from '@/lib/world/contract';
import type { WorldDomain, WorldPieceSummary, WorldSurfaceData } from '@/types/world-intelligence';

import { WorldNavigation } from './WorldNavigation';
import styles from './World.module.scss';

type View =
  | { kind: 'home' }
  | { kind: 'now' }
  | { kind: 'learn' }
  | { kind: 'library' }
  | { kind: 'domain'; domain: WorldDomain };

function minutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function PieceCard({ item }: { item: WorldPieceSummary }) {
  return (
    <Card as="article" className={styles['piece-card']}>
      <div className={styles['card-meta']}>
        <span>{item.mode === 'NOW' ? 'Ahora' : 'Aprender'}</span>
        <span>{worldDomainLabel(item.primaryDomain)}</span>
        <span className={styles['reading-time']}>
          <Clock3 size={13} aria-hidden="true" />
          {minutes(item.readingSeconds)}
        </span>
      </div>
      <h2>{item.headline}</h2>
      <p>{item.deck}</p>
      <Link className={styles['read-link']} href={worldPieceHref(item)}>
        Entenderlo bien →
      </Link>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className={styles.empty}>{text}</p>;
}

export function WorldSurfaceView({ data, view }: { data: WorldSurfaceData; view: View }) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <div className={styles.stack}>
        <WorldNavigation />
        <Card aria-labelledby="world-unavailable-title">
          <SectionHeader
            id="world-unavailable-title"
            title="World no está disponible"
            description="La interfaz falla cerrado si falta o es inválida la superficie publicada."
            icon={CircleAlert}
            domain="neutral"
          />
          <div className={styles.notice} data-tone="warning" role="status">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{data.notice ?? 'Superficie publicada no disponible.'}</span>
          </div>
        </Card>
      </div>
    );
  }

  const snapshot = data.snapshot;
  const all = listWorldItems(snapshot);
  let title = 'World';
  let description = 'Una edición finita para entender lo que importa sin convertirlo en un feed.';
  let items: readonly WorldPieceSummary[] = all;

  if (view.kind === 'now') {
    title = 'Ahora';
    description = 'Qué cambió en el mundo y merece atención hoy.';
    items = snapshot.now.items;
  } else if (view.kind === 'learn') {
    title = 'Aprender';
    description = 'Ideas durables que vale la pena entender aunque no sean nuevas.';
    items = snapshot.learn.items;
  } else if (view.kind === 'library') {
    title = 'Biblioteca';
    description =
      'Lo publicado queda disponible sin convertirse en pendientes ni deuda de lectura.';
  } else if (view.kind === 'domain') {
    title = worldDomainLabel(view.domain);
    description = 'Piezas publicadas de este tema, sin volver a ordenar la selección editorial.';
    items = all.filter((item) => item.primaryDomain === view.domain);
  }

  return (
    <div className={styles.stack}>
      <WorldNavigation />

      {data.notice ? (
        <div className={styles.notice} data-tone={data.stale ? 'warning' : 'info'} role="status">
          {data.stale ? (
            <CircleAlert size={16} aria-hidden="true" />
          ) : (
            <Info size={16} aria-hidden="true" />
          )}
          <span>{data.notice}</span>
        </div>
      ) : null}

      {view.kind === 'home' ? (
        <>
          <section className={styles.hero} aria-labelledby="world-today-title">
            <div>
              <p className={styles.eyebrow}>Edición · {snapshot.editionDate}</p>
              <h2 id="world-today-title">
                Lo suficiente para entender, no para quedar atrapado leyendo.
              </h2>
              <p>
                {snapshot.now.selectedReadingSeconds > 0
                  ? `Ahora: ${minutes(snapshot.now.selectedReadingSeconds)} de lectura seleccionada.`
                  : 'Hoy no hay historias actuales publicadas.'}
              </p>
            </div>
            <span className={styles['freshness-pill']} data-stale={data.stale ? 'true' : 'false'}>
              {data.stale ? 'Edición desactualizada' : 'Edición vigente'}
            </span>
          </section>

          <section className={styles.section} aria-labelledby="world-now-title">
            <div className={styles['section-heading']}>
              <div>
                <p className={styles.eyebrow}>Ahora</p>
                <h2 id="world-now-title">Tu edición de hoy</h2>
              </div>
              <Link className={styles['section-link']} href="/world/ahora">
                Ver Ahora →
              </Link>
            </div>
            {snapshot.now.items.length ? (
              <div className={styles.grid}>
                {snapshot.now.items.map((item) => (
                  <PieceCard key={item.briefId} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState text="No hay una historia actual que justifique ocupar tu atención." />
            )}
          </section>

          <section className={styles.section} aria-labelledby="world-learn-title">
            <div className={styles['section-heading']}>
              <div>
                <p className={styles.eyebrow}>Aprender</p>
                <h2 id="world-learn-title">Aprendé algo</h2>
              </div>
              <Link className={styles['section-link']} href="/world/aprender">
                Ver Aprender →
              </Link>
            </div>
            {snapshot.learn.items.length ? (
              <div className={styles.grid}>
                {snapshot.learn.items.map((item) => (
                  <PieceCard key={item.briefId} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState text="No hay una pieza evergreen publicada para esta edición." />
            )}
          </section>
        </>
      ) : (
        <section className={styles.section} aria-labelledby="world-view-title">
          <div className={styles['section-heading']}>
            <div>
              <p className={styles.eyebrow}>
                {view.kind === 'library' ? 'Sin backlog' : 'World Intelligence'}
              </p>
              <h2 id="world-view-title">{title}</h2>
              <p className={styles['section-description']}>{description}</p>
            </div>
            {view.kind === 'library' ? (
              <BookOpen size={20} aria-hidden="true" />
            ) : (
              <Sparkles size={20} aria-hidden="true" />
            )}
          </div>
          {items.length ? (
            <div className={styles.grid}>
              {items.map((item) => (
                <PieceCard key={item.briefId} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState text="Todavía no hay una pieza revisada y publicada en este dominio." />
          )}
        </section>
      )}

      <footer className={styles.provenance}>
        <span>
          PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · observado{' '}
          {snapshot.source.observedAt}
        </span>
        <span>Fuente editorial trazable</span>
      </footer>
    </div>
  );
}
