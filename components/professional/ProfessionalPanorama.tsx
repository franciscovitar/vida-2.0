import { CircleAlert, Info } from 'lucide-react';
import Link from 'next/link';

import type {
  ProfessionalConfidence,
  ProfessionalGrowthStatus,
  ProfessionalIntelligenceData,
} from '@/types/professional-intelligence';

import styles from './ProfessionalV2.module.scss';

type ProfessionalDecision = 'ACT' | 'TRY' | 'LEARN' | 'WATCH' | 'IGNORE' | 'NO_CHANGE';

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

function confidenceLabel(value: ProfessionalConfidence): string {
  return CONFIDENCE_LABELS[value];
}

function moveDecision(route: string): ProfessionalDecision {
  if (route === 'PROJECT_EXPERIENCE') return 'ACT';
  if (route === 'DIRECT_VERIFICATION_PLUS_BOUNDED_LAB') return 'LEARN';
  return 'TRY';
}

function DecisionBadge({ value }: { value: ProfessionalDecision }) {
  return (
    <span className={styles['decision-badge']} data-decision={value}>
      {value}
    </span>
  );
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
  const forecastSignal = snapshot.forecast.items[0];
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
          <h3 id="professional-changes-title">Tres cambios materiales, con decisión explícita</h3>
        </div>

        <div className={styles['panorama-list']}>
          {activePriority ? (
            <article className={styles['panorama-story']}>
              <div className={styles['panorama-story-head']}>
                <span className={styles['panorama-kicker']}>
                  Prioridad 1 · {GROWTH_STATUS_LABELS[activePriority.status]}
                </span>
                <DecisionBadge value="ACT" />
              </div>
              <h3>{activePriority.capability}</h3>
              <p>
                <strong>Qué cambió / se confirma:</strong> {activePriority.whyNow}
              </p>
              <p>
                <strong>Por qué importa:</strong> {activePriority.evidenceTarget}
              </p>
              <p className={styles['panorama-action']}>
                <strong>Para vos:</strong> {activePriority.practiceContract}
              </p>
            </article>
          ) : null}

          <article className={styles['panorama-story']}>
            <div className={styles['panorama-story-head']}>
              <span className={styles['panorama-kicker']}>Dirección profesional</span>
              <DecisionBadge value="NO_CHANGE" />
            </div>
            <h3>La base de software sigue siendo correcta</h3>
            <p>
              <strong>Qué se confirma:</strong> la evidencia actual no justifica abandonar
              software/web.
            </p>
            <p>
              <strong>Por qué importa:</strong> {snapshot.forecast.direction}
            </p>
            <p className={styles['panorama-action']}>
              <strong>Para vos:</strong>{' '}
              {forecastSignal?.aiInteraction ??
                'Profundizá el criterio de sistema y operación antes de perseguir otra moda.'}
            </p>
          </article>

          {marketSignal ? (
            <article className={styles['panorama-story']}>
              <div className={styles['panorama-story-head']}>
                <span className={styles['panorama-kicker']}>
                  Mercado · {marketSignal.geography} · {marketSignal.period}
                </span>
                <DecisionBadge value="WATCH" />
              </div>
              <h3>
                {marketSignal.title} · {marketSignal.value}
              </h3>
              <p>
                <strong>Qué cambió / se confirma:</strong> {marketSignal.explanation}
              </p>
              <p>
                <strong>Por qué importa:</strong> es una señal estructural para decidir dónde
                profundizar, no una predicción individual.
              </p>
              <p className={styles['panorama-action']}>
                <strong>Para vos:</strong> seguí la señal en Mercado y mantené visibles su
                geografía y período antes de cambiar el plan.
              </p>
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
                <div className={styles['panorama-move-head']}>
                  <div className={styles['panorama-meta']}>
                    <span>{ROUTE_LABELS[move.route] ?? move.route}</span>
                    <span>Confianza {confidenceLabel(move.confidence)}</span>
                  </div>
                  <DecisionBadge value={moveDecision(move.route)} />
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
          <Link className={styles['panorama-link']} href="/professional/crecimiento">
            Ver perfil y crecimiento →
          </Link>
          <Link className={styles['panorama-link']} href="/professional/biblioteca">
            Abrir biblioteca →
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
