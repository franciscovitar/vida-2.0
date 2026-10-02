import {
  BookOpen,
  Brain,
  CircleAlert,
  Info,
  LineChart,
  ShieldCheck,
  Target,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CareerResilience } from '@/components/professional/CareerResilience';
import { TechnologyLibrary } from '@/components/professional/TechnologyLibrary';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  findIntelligenceArticleForProfessionalRef,
  intelligenceArticleHref,
} from '@/lib/intelligence/contract';
import type {
  IntelligenceArticleSummary,
  IntelligenceEditorialData,
} from '@/types/intelligence-editorial';
import type {
  ProfessionalConfidence,
  ProfessionalGrowthStatus,
  ProfessionalIntelligenceData,
  ProfessionalOwnershipLane,
} from '@/types/professional-intelligence';
import type { CareerResilienceData } from '@/types/career-resilience';
import type { TechnologyLibraryData } from '@/types/technology-library';

import styles from './ProfessionalDashboard.module.scss';

const CONFIDENCE_LABELS: Record<ProfessionalConfidence, string> = {
  LOW: 'baja',
  MEDIUM: 'media',
  MEDIUM_HIGH: 'media-alta',
  HIGH: 'alta',
};

const OWNERSHIP_LABELS: Record<ProfessionalOwnershipLane, string> = {
  HUMAN_CORE: 'Vos sí o sí',
  HUMAN_PLUS_AI: 'Vos + IA',
  AI_DELEGATED: 'Delegable a IA',
};

const GROWTH_STATUS_LABELS: Record<ProfessionalGrowthStatus, string> = {
  QUEUED: 'Por empezar',
  LEARNING: 'Aprendiendo',
  PRACTICING: 'Practicando',
  READY_FOR_VERIFICATION: 'Listo para verificar',
  VERIFIED_FOR_CURRENT_SCOPE: 'Verificado para este alcance',
  DEFERRED: 'Diferido',
};

const ROUTE_LABELS: Record<string, string> = {
  PROJECT_EXPERIENCE: 'Proyecto real',
  DIRECT_VERIFICATION_PLUS_BOUNDED_LAB: 'Práctica corta + verificación',
};

const ROUTE_EXPLANATIONS: Record<string, string> = {
  PROJECT_EXPERIENCE:
    'La mejor forma de aprender esto no es mirar más teoría: es hacerlo en un sistema real y guardar evidencia de lo que pasó.',
  DIRECT_VERIFICATION_PLUS_BOUNDED_LAB:
    'La idea es resolver tareas nuevas, cortas y concretas para comprobar qué podés razonar vos, incluso usando IA como herramienta.',
};

const EVIDENCE_LABELS: Record<string, string> = {
  PRACTICED: 'Practicado',
  DEMONSTRATED: 'Demostrado con proyectos',
  EXTERNALLY_VALIDATED: 'Validado por terceros',
};

const OUTLOOK_LABELS: Record<string, string> = {
  POSITIVE_BUT_TRANSFORMING: 'Crece, pero cambia',
  STRONG_POSITIVE: 'Señal de crecimiento fuerte',
  PRESSURE_ON_ROUTINE_TASKS: 'Más presión sobre tareas rutinarias',
};

const TECHNOLOGY_LABELS: Record<string, string> = {
  CURRENT_STACK: 'Ya lo usás',
  ASSESS: 'Vale la pena evaluar',
  ASSESS_CONDITIONALLY: 'Evaluar si aparece el caso',
  ASSESS_ONLY_IF_IT_REDUCES_FRICTION_OR_COST: 'Evaluar sólo si mejora tiempo o costo',
  HOLD: 'Esperar por ahora',
};

const EVAL_LABELS: Record<string, string> = {
  OBSERVED_USE_ONLY: 'Uso real observado, sin comparación controlada',
  NOT_PERSONALLY_EVALUATED: 'Todavía no fue probado de forma controlada',
};

const LEARNING_LABELS: Record<string, string> = {
  DIRECT_VERIFICATION: 'Verificación directa',
  LAB: 'Práctica corta',
  PROJECT_EXPERIENCE: 'Proyecto real',
  DEFER: 'Dejar para más adelante',
};

const PROFILE_STATUS_LABELS: Record<string, string> = {
  SUPPORTED_BUT_UNDERSTATED: 'Es cierto, pero tu perfil lo muestra de menos',
  MISSING_FROM_PROFILE: 'Falta mostrarlo en tu perfil',
  TOO_BROAD: 'Todavía sería exagerado afirmarlo así',
};

const FLUENCY_STATUS_LABELS: Record<string, string> = {
  BASELINE_NOT_YET_CALIBRATED: 'Todavía falta medirlo bien',
};

const TASK_FAMILY_LABELS: Record<string, string> = {
  RESEARCH_SYNTHESIS: 'Investigación y síntesis',
  REPO_INSPECTION_DEBUG: 'Inspección y debugging de repositorios',
  UNIVERSITY_LEARNING: 'Aprendizaje universitario',
};

function fallbackLabel(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function confidenceLabel(value: ProfessionalConfidence): string {
  return CONFIDENCE_LABELS[value];
}

function ownershipDomain(
  value: ProfessionalOwnershipLane,
): 'learning' | 'productivity' | 'neutral' {
  if (value === 'HUMAN_CORE') return 'learning';
  if (value === 'HUMAN_PLUS_AI') return 'productivity';
  return 'neutral';
}

function More({ children, label = 'Ver más' }: { children: ReactNode; label?: string }) {
  return (
    <details className={styles.more}>
      <summary>{label}</summary>
      <div className={styles['more-body']}>{children}</div>
    </details>
  );
}

function ExplainerLink({ article }: { article: IntelligenceArticleSummary | null }) {
  if (!article) return null;

  return (
    <Link className={styles['explainer-link']} href={intelligenceArticleHref(article)}>
      Entender por qué →
    </Link>
  );
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatArsMillions(value: number): string {
  return `$${new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value / 1_000_000)} M`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

export function ProfessionalDashboard({
  data,
  editorial,
  technologyLibrary,
  careerResilience,
}: {
  data: ProfessionalIntelligenceData;
  editorial?: IntelligenceEditorialData;
  technologyLibrary?: TechnologyLibraryData;
  careerResilience?: CareerResilienceData;
}) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <Card aria-labelledby="professional-unavailable-title">
        <SectionHeader
          id="professional-unavailable-title"
          title="Profesional"
          description="No mostramos recomendaciones si falta la información canónica."
          icon={CircleAlert}
          domain="projects"
        />
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{data.notice ?? 'Información profesional no disponible.'}</span>
        </div>
      </Card>
    );
  }

  const snapshot = data.snapshot;
  const editorialSnapshot = editorial?.status === 'ready' ? editorial.snapshot : null;
  const retiredFacets = snapshot.delegationFrontier.examples.filter(
    (item) => item.learningDisposition === 'RETIRED_FROM_ACTIVE_LEARNING',
  );

  return (
    <div className={styles.stack}>
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

      <Card aria-labelledby="professional-simple-title">
        <SectionHeader
          id="professional-simple-title"
          title="En simple"
          description="La lectura corta de dónde estás parado profesionalmente."
          icon={Info}
          domain="projects"
        />
        <p className={styles['profile-lead']}>{snapshot.profileSummary}</p>
        <div className={styles['plain-note']}>
          <strong>Cómo leer esta pantalla:</strong>
          <span>
            primero qué conviene hacer, después qué huecos están activos y qué ya conviene delegar,
            y recién después mercado, herramientas y credenciales.
          </span>
        </div>
      </Card>

      <Card aria-labelledby="professional-now-title">
        <SectionHeader
          id="professional-now-title"
          title="Ahora: qué conviene hacer"
          description="Sólo dos movimientos con valor real. No es una lista infinita."
          icon={Target}
          domain="projects"
        />
        <div className={styles['now-grid']}>
          {snapshot.nowMoves.map((move) => (
            <article key={move.id} className={styles['now-card']}>
              <div className={styles['item-head']}>
                <Badge domain="projects" variant="outline">
                  {ROUTE_LABELS[move.route] ?? fallbackLabel(move.route)}
                </Badge>
                <span className={styles.confidence}>
                  Confianza {confidenceLabel(move.confidence)}
                </span>
              </div>
              <h3>{move.title}</h3>
              <p>{move.why}</p>
              <More>
                <p>
                  {ROUTE_EXPLANATIONS[move.route] ??
                    'Es una forma práctica de reducir incertidumbre antes de invertir más tiempo.'}
                </p>
              </More>
            </article>
          ))}
        </div>
      </Card>

      <Card aria-labelledby="professional-growth-title">
        <SectionHeader
          id="professional-growth-title"
          title="Crecimiento / Huecos a llenar"
          description="Las cinco capacidades activas que más vale cerrar ahora. La lista cambia cuando aparece evidencia nueva."
          icon={Brain}
          domain="learning"
        />
        <div className={styles['growth-summary']}>
          <strong>
            {snapshot.growth.cycleProgress.closed} / {snapshot.growth.cycleProgress.total}{' '}
            prioridades cerradas en este ciclo
          </strong>
          <span>No es un porcentaje de empleabilidad ni de dominio profesional total.</span>
        </div>

        <ol className={styles['growth-list']}>
          {snapshot.growth.items.map((item) => (
            <li key={item.id} className={styles['growth-item']}>
              <span className={styles.rank}>{item.rank}</span>
              <div className={styles['growth-body']}>
                <div className={styles['growth-title-row']}>
                  <h3>{item.capability}</h3>
                  <div className={styles['growth-badges']}>
                    <Badge domain={ownershipDomain(item.ownershipLane)} variant="outline">
                      {OWNERSHIP_LABELS[item.ownershipLane]}
                    </Badge>
                    <Badge domain="neutral" variant="outline">
                      {GROWTH_STATUS_LABELS[item.status]}
                    </Badge>
                  </div>
                </div>

                <p className={styles['growth-copy']}>{item.whyNow}</p>

                <div className={styles['growth-next']}>
                  <strong>Próximo paso</strong>
                  <span>{item.practiceContract}</span>
                </div>

                <More label="Ver qué falta y cómo comprobarlo">
                  <div className={styles['growth-detail-grid']}>
                    <div>
                      <strong>Facetas abiertas</strong>
                      <ul className={styles['facet-list']}>
                        {item.targetFacets.map((facet) => (
                          <li key={facet}>{facet}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Evidencia objetivo</strong>
                      <p>{item.evidenceTarget}</p>
                      {item.projectCandidate ? (
                        <p>
                          <strong>Dónde conviene hacerlo:</strong> {item.projectCandidate}
                        </p>
                      ) : null}
                      <p>
                        <strong>Confianza de esta prioridad:</strong>{' '}
                        {confidenceLabel(item.confidence)}.
                      </p>
                      <ExplainerLink
                        article={
                          findIntelligenceArticleForProfessionalRef(
                            editorialSnapshot,
                            `priority:${item.capability}`,
                          ) ??
                          findIntelligenceArticleForProfessionalRef(
                            editorialSnapshot,
                            `priority:${
                              snapshot.priorities.find((priority) => priority.rank === item.rank)
                                ?.capability ?? ''
                            }`,
                          )
                        }
                      />
                    </div>
                  </div>
                </More>
              </div>
            </li>
          ))}
        </ol>

        <div className={styles['frontier-review']}>
          <div className={styles['frontier-head']}>
            <strong>Lo que ya salió del estudio activo</strong>
            <span>
              Última revisión de delegación:{' '}
              <time dateTime={snapshot.delegationFrontier.lastReviewed}>
                {snapshot.delegationFrontier.lastReviewed}
              </time>
            </span>
          </div>
          <p>
            Estas tareas no cuentan como dominio personal: simplemente ya no justifican gastar
            tiempo de estudio mientras la IA las resuelva de forma verificable.
          </p>
          {retiredFacets.length > 0 ? (
            <ul className={styles['retired-list']}>
              {retiredFacets.map((item) => (
                <li key={item.facet}>
                  <div className={styles['item-head']}>
                    <strong>{item.facet}</strong>
                    <Badge domain="neutral" variant="outline">
                      Salió del estudio activo
                    </Badge>
                  </div>
                  <span>{item.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className={styles['frontier-empty']}>
              Todavía no hay facetas retiradas del estudio activo.
            </span>
          )}
        </div>
      </Card>

      <Card aria-labelledby="professional-work-split-title">
        <SectionHeader
          id="professional-work-split-title"
          title="Qué hacés vos y qué hace la IA"
          description="La idea no es competir con la IA: es usarla sin perder el criterio que te hace valioso."
          icon={Brain}
          domain="productivity"
        />
        <p className={styles.lead}>{snapshot.workSplit.principle}</p>
        <div className={styles['work-split-grid']}>
          <section className={styles['work-lane']}>
            <h3>Lo tenés que saber vos sí o sí</h3>
            <p>
              Decisiones que no conviene tercerizar porque necesitás poder juzgarlas y defenderlas.
            </p>
            <ul>
              {snapshot.workSplit.own.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <More>
                    <p>{item.explanation}</p>
                  </More>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles['work-lane']}>
            <h3>Conviene hacerlo con IA</h3>
            <p>
              Vos marcás dirección y criterios; la IA acelera implementación, análisis y variantes.
            </p>
            <ul>
              {snapshot.workSplit.withAi.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <More>
                    <p>{item.explanation}</p>
                  </More>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles['work-lane']}>
            <h3>Conviene delegarlo a la IA</h3>
            <p>Trabajo mecánico donde aprender cada detalle de memoria aporta poco valor.</p>
            <ul>
              {snapshot.workSplit.delegateToAi.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <More>
                    <p>{item.explanation}</p>
                  </More>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Card>

      <Card aria-labelledby="professional-evidence-title">
        <SectionHeader
          id="professional-evidence-title"
          title="Lo que ya podés demostrar"
          description="Capacidades respaldadas por trabajo real, no sólo por autodescripción."
          icon={ShieldCheck}
          domain="projects"
        />
        <ul className={styles['simple-list']}>
          {snapshot.strongestEvidence.map((item) => (
            <li key={item.capability}>
              <div className={styles['item-head']}>
                <strong>{item.capability}</strong>
                <Badge domain="projects" variant="outline">
                  {EVIDENCE_LABELS[item.state] ?? fallbackLabel(item.state)}
                </Badge>
              </div>
              <More>
                <p>{item.note}</p>
                <p>
                  <strong>Confianza de esta lectura:</strong> {confidenceLabel(item.confidence)}.
                </p>
              </More>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="professional-market-title">
        <SectionHeader
          id="professional-market-title"
          title="Mercado y sueldos"
          description="Números con geografía y fecha visibles. Argentina y el mercado internacional no se mezclan."
          icon={LineChart}
          domain="projects"
        />
        <p className={styles.lead}>{snapshot.market.headline}</p>

        <div className={styles['market-subsection']}>
          <h3>Señales globales</h3>
          <div className={styles['signal-grid']}>
            {snapshot.market.globalSignals.map((signal) => (
              <article className={styles['signal-card']} key={signal.id}>
                <span className={styles['metric-value']}>{signal.value}</span>
                <strong>{signal.title}</strong>
                <p>{signal.explanation}</p>
                <More>
                  <p>
                    {signal.geography} · {signal.period}
                  </p>
                  <a href={signal.sourceUrl} target="_blank" rel="noreferrer">
                    Fuente: {signal.sourceLabel}
                  </a>
                </More>
              </article>
            ))}
          </div>
        </div>

        <div className={styles['market-subsection']}>
          <div className={styles['subsection-head']}>
            <div>
              <h3>Referencia internacional: EE.UU.</h3>
              <p>
                No existe un “sueldo mundial” comparable que sea serio. Usamos BLS como referencia
                internacional porque publica empleo, crecimiento y salarios con metodología oficial.
              </p>
            </div>
          </div>
          <div className={styles['benchmark-grid']}>
            {snapshot.market.internationalBenchmarks.map((item) => (
              <article className={styles['benchmark-card']} key={item.id}>
                <strong>{item.role}</strong>
                <div className={styles['benchmark-main']}>
                  <span className={styles['metric-value']}>+{item.employmentGrowthPercent}%</span>
                  <span>empleo proyectado</span>
                </div>
                <dl className={styles['metric-list']}>
                  <div>
                    <dt>Aperturas por año</dt>
                    <dd>{formatInteger(item.annualOpenings)}</dd>
                  </div>
                  <div>
                    <dt>Salario mediano anual</dt>
                    <dd>{formatUsd(item.medianAnnualUsd)}</dd>
                  </div>
                </dl>
                <More>
                  <p>
                    {item.geography} · proyección {item.period}. El crecimiento no es una promesa de
                    conseguir trabajo; sirve para comparar la dirección del mercado.
                  </p>
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    Fuente: {item.sourceLabel}
                  </a>
                </More>
              </article>
            ))}
          </div>
        </div>

        <div className={styles['market-subsection']}>
          <div className={styles['subsection-head']}>
            <div>
              <h3>Argentina: referencias salariales</h3>
              <p>
                Son <strong>medianas brutas mensuales</strong>, no promedios. En salarios suele ser
                una referencia más útil porque reduce el efecto de valores extremos.
              </p>
            </div>
          </div>
          <div className={styles['salary-grid']}>
            {snapshot.market.argentinaSalaryRoles.map((role) => (
              <article className={styles['salary-card']} key={role.id}>
                <strong>{role.role}</strong>
                <span className={styles['period-label']}>{role.period}</span>
                <ul className={styles['salary-list']}>
                  {role.points.map((point) => (
                    <li key={point.label}>
                      <span>{point.label}</span>
                      <strong>{formatArsMillions(point.medianArsGrossMonthly)}</strong>
                    </li>
                  ))}
                </ul>
                <More>
                  <ul className={styles['detail-list']}>
                    {role.points.map((point) => (
                      <li key={point.label}>
                        {point.label}: muestra de {point.sampleSize} respuestas
                        {point.dollarized ? ' · al menos parcialmente dolarizado' : ''}.
                      </li>
                    ))}
                  </ul>
                  <a href={role.sourceUrl} target="_blank" rel="noreferrer">
                    Fuente: {role.sourceLabel}
                  </a>
                </More>
              </article>
            ))}
          </div>
        </div>

        <More label="Cómo leer estos números">
          <ul className={styles['detail-list']}>
            {snapshot.market.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </More>
      </Card>

      {careerResilience ? <CareerResilience data={careerResilience} /> : null}

      <Card aria-labelledby="professional-forecast-title">
        <SectionHeader
          id="professional-forecast-title"
          title="Hacia dónde parece moverse tu perfil"
          description="Son señales de dirección, no predicciones exactas."
          icon={LineChart}
          domain="productivity"
        />
        <p className={styles.lead}>{snapshot.forecast.direction}</p>
        <div className={styles['forecast-grid']}>
          {snapshot.forecast.items.map((item) => (
            <article key={item.subject} className={styles['forecast-item']}>
              <div className={styles['item-head']}>
                <strong>{item.label}</strong>
                <Badge domain="neutral" variant="outline">
                  {OUTLOOK_LABELS[item.nearOutlook] ?? fallbackLabel(item.nearOutlook)}
                </Badge>
              </div>
              <More>
                <p>{item.aiInteraction}</p>
                <p>
                  <strong>Horizonte:</strong> 12–24 meses · <strong>confianza:</strong>{' '}
                  {confidenceLabel(item.nearConfidence)}.
                </p>
              </More>
            </article>
          ))}
        </div>
      </Card>

      <div className={styles.columns}>
        <Card aria-labelledby="professional-tech-title">
          <SectionHeader
            id="professional-tech-title"
            title="Radar actual de herramientas"
            description="Pocas cosas que hoy están en uso, evaluación o espera. La biblioteca completa vive aparte."
            icon={Workflow}
            domain="productivity"
          />
          <ul className={styles['simple-list']}>
            {snapshot.technologies.map((item) => (
              <li key={item.id}>
                <div className={styles['item-head']}>
                  <strong>{item.name}</strong>
                  <Badge
                    domain={item.disposition === 'HOLD' ? 'neutral' : 'productivity'}
                    variant="outline"
                  >
                    {TECHNOLOGY_LABELS[item.disposition] ?? fallbackLabel(item.disposition)}
                  </Badge>
                </div>
                <p>{item.capability}</p>
                <More>
                  <p>
                    <strong>Para qué te serviría:</strong> {item.application}
                  </p>
                  <p>
                    <strong>Costo:</strong> {item.priceLabel}
                  </p>
                  <p>
                    <strong>Qué tan probado está para vos:</strong>{' '}
                    {EVAL_LABELS[item.personalEvalStatus] ?? fallbackLabel(item.personalEvalStatus)}
                    .
                  </p>
                  <p>
                    La decisión de adoptarlo o no la toma el PAS; esta pantalla sólo te orienta.
                  </p>
                  <ExplainerLink
                    article={findIntelligenceArticleForProfessionalRef(
                      editorialSnapshot,
                      `technology:${item.id}`,
                    )}
                  />
                </More>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="professional-learning-title">
          <SectionHeader
            id="professional-learning-title"
            title="Cómo conviene aprenderlo"
            description="No todo hueco se arregla con un curso."
            icon={BookOpen}
            domain="learning"
          />
          <ul className={styles['simple-list']}>
            {snapshot.learning.map((item) => (
              <li key={item.id}>
                <div className={styles['item-head']}>
                  <strong>{item.capability}</strong>
                  <Badge domain="learning" variant="outline">
                    {LEARNING_LABELS[item.mode] ?? fallbackLabel(item.mode)}
                  </Badge>
                </div>
                <More>
                  <p>{item.rationale}</p>
                  <p>
                    <strong>¿Curso ahora?</strong> {item.courseNeededNow ? 'Sí' : 'No'} ·{' '}
                    <strong>¿Credencial ahora?</strong> {item.credentialNeededNow ? 'Sí' : 'No'}.
                  </p>
                </More>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {technologyLibrary ? <TechnologyLibrary data={technologyLibrary} /> : null}

      <div className={styles.columns}>
        <Card aria-labelledby="professional-profile-title">
          <SectionHeader
            id="professional-profile-title"
            title="Cómo conviene presentarte profesionalmente"
            description="Qué ya podés decir con respaldo y qué todavía conviene no exagerar."
            icon={Info}
            domain="neutral"
          />
          <ul className={styles['simple-list']}>
            {snapshot.profileFindings.map((item) => (
              <li key={item.id}>
                <div className={styles['item-head']}>
                  <strong>{item.claim}</strong>
                  <Badge domain="neutral" variant="outline">
                    {PROFILE_STATUS_LABELS[item.status] ?? fallbackLabel(item.status)}
                  </Badge>
                </div>
                <More>
                  <p>{item.note}</p>
                </More>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="professional-fluency-title">
          <SectionHeader
            id="professional-fluency-title"
            title="Qué tan bien estás usando la IA"
            description="No hay un puntaje mágico: se mide por resultados reales y cuánto retrabajo necesitás."
            icon={Brain}
            domain="productivity"
          />
          <div className={styles['fluency-meta']}>
            <Badge domain="neutral" variant="outline">
              {FLUENCY_STATUS_LABELS[snapshot.aiFluency.status] ??
                fallbackLabel(snapshot.aiFluency.status)}
            </Badge>
            <span>{snapshot.aiFluency.materialOutcomesLogged} resultados materiales medidos</span>
          </div>
          <ul className={styles['simple-list']}>
            {snapshot.aiFluency.taskFamilies.map((family) => (
              <li key={family.id}>
                <strong>{TASK_FAMILY_LABELS[family.id] ?? fallbackLabel(family.id)}</strong>
                <More>
                  <p>
                    <strong>Ruta actual:</strong> {family.route}.
                  </p>
                  <p>
                    <strong>Próxima medición:</strong> {family.nextMeasurement}
                  </p>
                </More>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <footer className={styles.provenance}>
        <span>
          PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · evidencia observada{' '}
          {snapshot.source.observedAt}
        </span>
        <span>
          Snapshot generado {snapshot.source.generatedAt}
          {data.stale ? ' · necesita actualización' : ' · vigente'}
        </span>
      </footer>
    </div>
  );
}
