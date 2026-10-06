import { CircleAlert, Info } from 'lucide-react';

import { ProfessionalLearningHandoff } from '@/components/professional/ProfessionalLearningHandoff';
import { buildProfessionalLearningHandoffPrompt } from '@/lib/professional/learning-handoff';
import type {
  ProfessionalConfidence,
  ProfessionalGrowthStatus,
  ProfessionalIntelligenceData,
  ProfessionalOwnershipLane,
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

const OWNERSHIP_LABELS: Record<ProfessionalOwnershipLane, string> = {
  HUMAN_CORE: 'Vos sí o sí',
  HUMAN_PLUS_AI: 'Vos + IA',
  AI_DELEGATED: 'Delegable a IA',
};

const PROFILE_STATUS_LABELS: Record<string, string> = {
  SUPPORTED_BUT_UNDERSTATED: 'Sostenido, pero subrepresentado',
  MISSING_FROM_PROFILE: 'Falta mostrarlo',
  TOO_BROAD: 'Todavía sería demasiado amplio',
};

const DISPOSITION_LABELS: Record<string, string> = {
  RETIRED_FROM_ACTIVE_LEARNING: 'Retirado del aprendizaje activo',
  PRACTICE_THROUGH_REAL_WORK: 'Practicar con trabajo real',
  PRACTICE_WITH_AI_ALLOWED: 'Practicar con IA permitida',
  ACTIVE: 'Activo',
};

function confidenceLabel(value: ProfessionalConfidence): string {
  return CONFIDENCE_LABELS[value];
}

export function ProfessionalGrowth({ data }: { data: ProfessionalIntelligenceData }) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <section className={styles.section} aria-labelledby="professional-growth-unavailable">
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span id="professional-growth-unavailable">
            {data.notice ?? 'Perfil y crecimiento no disponibles.'}
          </span>
        </div>
      </section>
    );
  }

  const snapshot = data.snapshot;
  const growth = snapshot.growth;

  return (
    <div className={styles.growth}>
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

      <section className={styles['growth-hero']} aria-labelledby="professional-growth-title">
        <p className={styles.eyebrow}>
          Perfil & crecimiento · observado {snapshot.source.observedAt}
        </p>
        <h2 id="professional-growth-title">Crecer sobre evidencia, no sobre títulos</h2>
        <p>{snapshot.profileSummary}</p>
        <div className={styles['growth-meta']}>
          <span>Roles objetivo: {growth.targetRoleFamily.join(' · ')}</span>
          <span>
            Cola actual: {growth.cycleProgress.closed} de {growth.cycleProgress.total} cerradas
          </span>
        </div>
        <p className={styles['growth-caveat']}>{growth.cycleProgress.meaning}</p>
      </section>

      <section className={styles['growth-section']} aria-labelledby="growth-evidence-title">
        <div className={styles['growth-heading']}>
          <p className={styles.eyebrow}>Evidencia más fuerte</p>
          <h3 id="growth-evidence-title">Lo que ya está demostrado</h3>
        </div>

        <div className={styles['growth-evidence-list']}>
          {snapshot.strongestEvidence.map((item) => (
            <article key={item.capability}>
              <div className={styles['growth-row-head']}>
                <h4>{item.capability}</h4>
                <span>Confianza {confidenceLabel(item.confidence)}</span>
              </div>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles['growth-section']} aria-labelledby="growth-queue-title">
        <div className={styles['growth-heading']}>
          <p className={styles.eyebrow}>Cola de crecimiento</p>
          <h3 id="growth-queue-title">Qué conviene fortalecer ahora</h3>
          <p>
            El orden viene del snapshot canónico. Completar esta cola no equivale a “dominar” una
            profesión ni garantiza empleabilidad.
          </p>
        </div>

        <div className={styles['growth-queue']}>
          {growth.items.map((item) => (
            <article className={styles['growth-item']} key={item.id}>
              <div className={styles['growth-rank']}>{item.rank}</div>
              <div className={styles['growth-item-body']}>
                <div className={styles['growth-row-head']}>
                  <span className={styles['growth-kicker']}>
                    {GROWTH_STATUS_LABELS[item.status]} · {OWNERSHIP_LABELS[item.ownershipLane]}
                  </span>
                  <span>Confianza {confidenceLabel(item.confidence)}</span>
                </div>
                <h4>{item.capability}</h4>
                <p>{item.whyNow}</p>
                <div className={styles['growth-contract']}>
                  <strong>Práctica</strong>
                  <span>{item.practiceContract}</span>
                </div>
                <div className={styles['growth-contract']}>
                  <strong>Evidencia objetivo</strong>
                  <span>{item.evidenceTarget}</span>
                </div>
                {item.projectCandidate ? (
                  <div className={styles['growth-contract']}>
                    <strong>Proyecto candidato</strong>
                    <span>{item.projectCandidate}</span>
                  </div>
                ) : null}

                <details className={styles['growth-details']}>
                  <summary>Ver facetas y criterio de verificación</summary>
                  <div className={styles['growth-details-body']}>
                    <div>
                      <strong>Facetas abiertas</strong>
                      <ul>
                        {item.targetFacets.map((facet) => (
                          <li key={facet}>{facet}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Tenés que poder demostrar</strong>
                      <ul>
                        {item.learningHandoff.mustDemonstrate.map((requirement) => (
                          <li key={requirement}>{requirement}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Regla de evidencia fresca</strong>
                      <p>{item.learningHandoff.freshEvidenceRule}</p>
                    </div>
                  </div>
                </details>

                <ProfessionalLearningHandoff
                  prompt={buildProfessionalLearningHandoffPrompt(item, growth.targetRoleFamily)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles['growth-section']} aria-labelledby="growth-ownership-title">
        <div className={styles['growth-heading']}>
          <p className={styles.eyebrow}>Ownership y delegación</p>
          <h3 id="growth-ownership-title">Qué sigue siendo tu responsabilidad</h3>
          <p>{snapshot.workSplit.principle}</p>
        </div>

        <div className={styles['growth-lanes']}>
          <article>
            <span className={styles['growth-kicker']}>Vos sí o sí</span>
            <ul>
              {snapshot.workSplit.own.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.explanation}</span>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <span className={styles['growth-kicker']}>Vos + IA</span>
            <ul>
              {snapshot.workSplit.withAi.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.explanation}</span>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <span className={styles['growth-kicker']}>Delegable a IA</span>
            <ul>
              {snapshot.workSplit.delegateToAi.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.explanation}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <details className={styles['growth-details']}>
          <summary>Ver frontera de delegación por faceta</summary>
          <div className={styles['growth-frontier']}>
            {snapshot.delegationFrontier.examples.map((item) => (
              <article key={item.facet}>
                <div className={styles['growth-row-head']}>
                  <h4>{item.facet}</h4>
                  <span>{OWNERSHIP_LABELS[item.currentLane]}</span>
                </div>
                <p>{item.reason}</p>
                <small>
                  {DISPOSITION_LABELS[item.learningDisposition] ?? item.learningDisposition}
                </small>
              </article>
            ))}
          </div>
        </details>
      </section>

      <section className={styles['growth-section']} aria-labelledby="growth-profile-title">
        <div className={styles['growth-heading']}>
          <p className={styles.eyebrow}>Posicionamiento profesional</p>
          <h3 id="growth-profile-title">Qué podés afirmar y qué todavía no</h3>
          <p>
            Esto describe evidencia actual. No modifica automáticamente CV, LinkedIn ni perfiles
            públicos.
          </p>
        </div>

        <div className={styles['growth-profile-list']}>
          {snapshot.profileFindings.map((item) => (
            <article key={item.id}>
              <div className={styles['growth-row-head']}>
                <h4>{item.claim}</h4>
                <span>{PROFILE_STATUS_LABELS[item.status] ?? item.status}</span>
              </div>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className={styles['growth-provenance']}>
        PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · frontera de delegación revisada{' '}
        {snapshot.delegationFrontier.lastReviewed}
      </footer>
    </div>
  );
}
