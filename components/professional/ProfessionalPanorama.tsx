import { CircleAlert, Info } from 'lucide-react';
import Link from 'next/link';

import type {
  ProfessionalConfidence,
  ProfessionalGrowthStatus,
  ProfessionalIntelligenceData,
} from '@/types/professional-intelligence';

import styles from './ProfessionalV2.module.scss';

const CONFIDENCE_LABELS: Record<ProfessionalConfidence, string> = {
  LOW: 'baja',
  MEDIUM: 'media',
  MEDIUM_HIGH: 'media-alta',
  HIGH: 'alta',
};

const GROWTH_STATUS_LABELS: Record<ProfessionalGrowthStatus, string> = {
  QUEUED: 'por empezar',
  LEARNING: 'aprendiendo',
  PRACTICING: 'en práctica',
  READY_FOR_VERIFICATION: 'listo para verificar',
  VERIFIED_FOR_CURRENT_SCOPE: 'verificado para este alcance',
  DEFERRED: 'diferido',
};

const ROUTE_LABELS: Record<string, string> = {
  PROJECT_EXPERIENCE: 'Experiencia real',
  DIRECT_VERIFICATION_PLUS_BOUNDED_LAB: 'Práctica + verificación',
};

const EVIDENCE_LABELS: Record<string, string> = {
  PRACTICED: 'Practicado',
  DEMONSTRATED: 'Demostrado',
  EXTERNALLY_VALIDATED: 'Validado externamente',
};

function confidenceLabel(value: ProfessionalConfidence): string {
  return CONFIDENCE_LABELS[value];
}

export function ProfessionalPanorama({ data }: { data: ProfessionalIntelligenceData }) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.section} aria-labelledby="professional-panorama-unavailable">
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span id="professional-panorama-unavailable">
            {data.notice ?? 'Panorama profesional no disponible.'}
          </span>
        </div>
      </section>
    );
  }

  const snapshot = data.snapshot;
  const activePriority = snapshot.growth.items[0];
  const marketSignal = snapshot.market.globalSignals[0];
  const strongestEvidence = snapshot.strongestEvidence[0];
  const currentMoves = snapshot.nowMoves.slice(0, 3);

  return (
    <div className={styles.panorama}>
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

      <section className={styles['panorama-hero']} aria-labelledby="professional-panorama-title">
        <p className={styles.eyebrow}>
          Panorama profesional · observado {snapshot.source.observedAt}
        </p>
        <h2 id="professional-panorama-title">Tu panorama profesional</h2>
        <p>{snapshot.profileSummary}</p>
        <div className={styles['panorama-meta']}>
          <span>{currentMoves.length} movimientos actuales</span>
          <span>
            {snapshot.growth.cycleProgress.total} prioridades activas ·{' '}
            {snapshot.growth.cycleProgress.closed} cerradas
          </span>
        </div>
      </section>

      <section className={styles['panorama-section']} aria-labelledby="professional-changes-title">
        <div className={styles['panorama-heading']}>
          <p className={styles.eyebrow}>Qué cambió / qué se confirma</p>
          <h3 id="professional-changes-title">Lo material, sin llenar la portada</h3>
        </div>

        <div className={styles['panorama-list']}>
          {activePriority ? (
            <article className={styles['panorama-story']}>
              <span className={styles['panorama-kicker']}>
                Prioridad 1 · {GROWTH_STATUS_LABELS[activePriority.status]}
              </span>
              <h3>{activePriority.capability}</h3>
              <p>{activePriority.whyNow}</p>
              <p className={styles['panorama-action']}>
                <strong>Ahora:</strong> {activePriority.practiceContract}
              </p>
            </article>
          ) : null}

          <article className={styles['panorama-story']}>
            <span className={styles['panorama-kicker']}>Dirección profesional</span>
            <h3>La base de software sigue siendo correcta</h3>
            <p>{snapshot.forecast.direction}</p>
            <div className={styles['panorama-meta']}>
              <span>Confianza {confidenceLabel(snapshot.forecast.confidence)}</span>
              <span>Sin necesidad de cambiar de rumbo por moda</span>
            </div>
          </article>

          {marketSignal ? (
            <article className={styles['panorama-story']}>
              <span className={styles['panorama-kicker']}>
                Mercado · {marketSignal.geography} · {marketSignal.period}
              </span>
              <h3>
                {marketSignal.title} · {marketSignal.value}
              </h3>
              <p>{marketSignal.explanation}</p>
            </article>
          ) : null}

          {strongestEvidence ? (
            <article className={styles['panorama-story']}>
              <span className={styles['panorama-kicker']}>
                Evidencia · {EVIDENCE_LABELS[strongestEvidence.state] ?? strongestEvidence.state}
              </span>
              <h3>{strongestEvidence.capability}</h3>
              <p>{strongestEvidence.note}</p>
              <div className={styles['panorama-meta']}>
                <span>Confianza {confidenceLabel(strongestEvidence.confidence)}</span>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className={styles['panorama-section']} aria-labelledby="professional-now-title">
        <div className={styles['panorama-heading']}>
          <p className={styles.eyebrow}>Qué conviene hacer ahora</p>
          <h3 id="professional-now-title">Pocos movimientos, con motivo claro</h3>
        </div>

        <div className={styles['panorama-moves']}>
          {currentMoves.map((move, index) => (
            <article className={styles['panorama-move']} key={move.id}>
              <span className={styles['panorama-move-index']}>{index + 1}</span>
              <div>
                <div className={styles['panorama-meta']}>
                  <span>{ROUTE_LABELS[move.route] ?? move.route}</span>
                  <span>Confianza {confidenceLabel(move.confidence)}</span>
                </div>
                <h3>{move.title}</h3>
                <p>{move.why}</p>
              </div>
            </article>
          ))}
        </div>

        <div className={styles['panorama-links']}>
          <Link className={styles['panorama-link']} href="/professional/mercado">
            Ver mercado y resiliencia →
          </Link>
          <Link className={styles['panorama-link']} href="/professional/herramientas">
            Ver comparadores de herramientas →
          </Link>
        </div>
      </section>

      <footer className={styles['panorama-provenance']}>
        PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · snapshot generado{' '}
        {snapshot.source.generatedAt}
      </footer>
    </div>
  );
}
