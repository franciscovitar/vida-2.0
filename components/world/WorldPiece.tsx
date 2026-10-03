import { CircleAlert, Info } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { worldDomainLabel } from '@/lib/world/contract';
import type { WorldPieceData } from '@/types/world-intelligence';

import { WorldNavigation } from './WorldNavigation';
import styles from './World.module.scss';

function minutes(seconds: number): string {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

export function WorldPieceView({ data }: { data: WorldPieceData }) {
  if (data.status !== 'ready' || !data.piece || !data.summary) {
    return (
      <div className={styles.stack}>
        <WorldNavigation />
        <Card aria-labelledby="world-piece-unavailable-title">
          <SectionHeader
            id="world-piece-unavailable-title"
            title="Pieza no disponible"
            description="World no reconstruye artículos desde cards, evidencia cruda ni texto viejo."
            icon={CircleAlert}
            domain="neutral"
          />
          <div className={styles.notice} data-tone="warning" role="status">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{data.notice ?? 'La pieza publicada no está disponible.'}</span>
          </div>
        </Card>
      </div>
    );
  }

  const piece = data.piece;

  return (
    <article className={styles['article-shell']}>
      <WorldNavigation />

      {data.notice ? (
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{data.notice}</span>
        </div>
      ) : null}

      <header className={styles['article-header']}>
        <p className={styles['article-kicker']}>
          <span>{piece.mode === 'NOW' ? 'Ahora' : 'Aprender'}</span>
          <span>·</span>
          <span>{worldDomainLabel(piece.primaryDomain)}</span>
          <span>·</span>
          <span>{minutes(piece.readingSeconds)}</span>
        </p>
        <h1>{piece.headline}</h1>
        <p className={styles['article-deck']}>{piece.deck}</p>
      </header>

      <div className={styles['article-body']}>
        {piece.sections.map((section) => (
          <section className={styles['article-section']} key={section.id}>
            <h2>{section.title}</h2>
            {section.blocks.map((block, index) => (
              <p key={`${section.id}-${index}`} className={styles['article-block']} data-kind={block.kind}>
                {block.text}
              </p>
            ))}
          </section>
        ))}
      </div>

      <section className={styles['feedback-pending']} aria-labelledby="world-feedback-title">
        <Info size={17} aria-hidden="true" />
        <div>
          <strong id="world-feedback-title">Feedback explícito: Phase 10</strong>
          <p>
            Útil · Ya lo sabía · Quiero profundizar · No me interesa · Muy básico · Muy detallado.
            Todavía no se guardan respuestas: no creamos una base paralela solo para simular el flujo.
          </p>
        </div>
      </section>

      <section className={styles['source-section']} aria-labelledby="world-sources-title">
        <h2 id="world-sources-title">Fuentes y contexto</h2>
        <ul>
          {piece.backgroundNotes.map((source) => (
            <li key={source.backgroundRef}>
              <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.term}</a>
              <span>{source.sourceRole} · {source.sourceId}</span>
            </li>
          ))}
        </ul>
      </section>

      <nav className={styles['back-links']} aria-label="Navegación de la pieza">
        <Link href="/world">← World</Link>
        <Link href={piece.mode === 'NOW' ? '/world/ahora' : '/world/aprender'}>
          {piece.mode === 'NOW' ? 'Ahora →' : 'Aprender →'}
        </Link>
        <Link href="/world/biblioteca">Biblioteca →</Link>
      </nav>

      <footer className={styles.provenance}>
        <span>PAS <code>{piece.source.commit.slice(0, 8)}</code> · draft <code>{piece.editorialDraftSha256.slice(0, 10)}</code></span>
        <span>HUMAN_APPROVED</span>
      </footer>
    </article>
  );
}
