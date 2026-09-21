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

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  findIntelligenceArticleForProfessionalRef,
  intelligenceArticleHref,
} from '@/lib/intelligence/contract';
import type {
  IntelligenceArticleSummary,
  IntelligenceEditorialData,
} from '@/types/intelligence-editorial';
import type { ProfessionalIntelligenceData } from '@/types/professional-intelligence';

import styles from './ProfessionalDashboard.module.scss';

function humanizeToken(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function ExplainerLink({ article }: { article: IntelligenceArticleSummary | null }) {
  if (!article) return null;

  return (
    <Link className={styles['explainer-link']} href={intelligenceArticleHref(article)}>
      Entender por qué →
    </Link>
  );
}

export function ProfessionalDashboard({
  data,
  editorial,
}: {
  data: ProfessionalIntelligenceData;
  editorial?: IntelligenceEditorialData;
}) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <Card aria-labelledby="professional-unavailable-title">
        <SectionHeader
          id="professional-unavailable-title"
          title="Professional Intelligence"
          description="La vista falla cerrado: no inventa recomendaciones cuando falta el snapshot canónico derivado."
          icon={CircleAlert}
          domain="projects"
        />
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{data.notice ?? 'Snapshot profesional no disponible.'}</span>
        </div>
      </Card>
    );
  }

  const snapshot = data.snapshot;
  const editorialSnapshot = editorial?.status === 'ready' ? editorial.snapshot : null;

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

      <Card aria-labelledby="professional-now-title">
        <SectionHeader
          id="professional-now-title"
          title="Ahora"
          description="Pocas acciones con alto valor de información. No es una lista infinita."
          icon={Target}
          domain="projects"
        />
        <div className={styles['now-grid']}>
          {snapshot.nowMoves.map((move) => (
            <article key={move.id} className={styles['now-card']}>
              <div className={styles['item-head']}>
                <Badge domain="projects" variant="outline">
                  {humanizeToken(move.route)}
                </Badge>
                <Badge domain="neutral" variant="outline">
                  {move.confidence}
                </Badge>
              </div>
              <h3>{move.title}</h3>
              <p>{move.why}</p>
            </article>
          ))}
        </div>
      </Card>

      <div className={styles.columns}>
        <Card aria-labelledby="professional-priority-title">
          <SectionHeader
            id="professional-priority-title"
            title="Qué desarrollar / demostrar"
            description="Único top vigente. Se reemplaza cuando cambia la evidencia."
            icon={Brain}
            domain="learning"
          />
          <ol className={styles['priority-list']}>
            {snapshot.priorities.map((item) => (
              <li key={item.rank}>
                <span className={styles.rank}>{item.rank}</span>
                <div>
                  <strong>{item.capability}</strong>
                  <p>{item.action}</p>
                  <small>
                    {humanizeToken(item.actionType)} · confianza {item.confidence}
                  </small>
                  <ExplainerLink
                    article={findIntelligenceArticleForProfessionalRef(
                      editorialSnapshot,
                      `priority:${item.capability}`,
                    )}
                  />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card aria-labelledby="professional-evidence-title">
          <SectionHeader
            id="professional-evidence-title"
            title="Evidencia fuerte"
            description="Lo que los artefactos actuales sí permiten sostener."
            icon={ShieldCheck}
            domain="projects"
          />
          <ul className={styles['simple-list']}>
            {snapshot.strongestEvidence.map((item) => (
              <li key={item.capability}>
                <div className={styles['item-head']}>
                  <strong>{item.capability}</strong>
                  <Badge domain="projects" variant="outline">
                    {humanizeToken(item.state)}
                  </Badge>
                </div>
                <p>{item.note}</p>
              </li>
            ))}
          </ul>
          <p className={styles.summary}>{snapshot.profileSummary}</p>
        </Card>
      </div>

      <Card aria-labelledby="professional-forecast-title">
        <SectionHeader
          id="professional-forecast-title"
          title="Hacia dónde parece moverse"
          description="Escenarios y señales; no predicciones exactas ni probabilidades de reemplazo."
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
                  {humanizeToken(item.nearOutlook)}
                </Badge>
              </div>
              <p>{item.aiInteraction}</p>
              <small>12–24m · confianza {item.nearConfidence}</small>
            </article>
          ))}
        </div>
      </Card>

      <div className={styles.columns}>
        <Card aria-labelledby="professional-tech-title">
          <SectionHeader
            id="professional-tech-title"
            title="IA y tecnología"
            description="Estado actual; una propuesta no equivale a adopción."
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
                    {humanizeToken(item.disposition)}
                  </Badge>
                </div>
                <p>{item.capability}</p>
                <p>{item.application}</p>
                <small>
                  {item.priceLabel} · {item.personalEvalStatus} · system-maintenance decide
                </small>
                <ExplainerLink
                  article={findIntelligenceArticleForProfessionalRef(
                    editorialSnapshot,
                    `technology:${item.id}`,
                  )}
                />
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="professional-learning-title">
          <SectionHeader
            id="professional-learning-title"
            title="Learning / credenciales"
            description="El sistema puede decidir explícitamente que no hace falta un curso o credencial."
            icon={BookOpen}
            domain="learning"
          />
          <ul className={styles['simple-list']}>
            {snapshot.learning.map((item) => (
              <li key={item.id}>
                <div className={styles['item-head']}>
                  <strong>{item.capability}</strong>
                  <Badge domain="learning" variant="outline">
                    {humanizeToken(item.mode)}
                  </Badge>
                </div>
                <p>{item.rationale}</p>
                <small>
                  Curso ahora: {item.courseNeededNow ? 'sí' : 'no'} · credencial ahora:{' '}
                  {item.credentialNeededNow ? 'sí' : 'no'}
                </small>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className={styles.columns}>
        <Card aria-labelledby="professional-profile-title">
          <SectionHeader
            id="professional-profile-title"
            title="Perfil profesional"
            description="Qué está subrepresentado y qué todavía sería demasiado fuerte afirmar."
            icon={Info}
            domain="neutral"
          />
          <ul className={styles['simple-list']}>
            {snapshot.profileFindings.map((item) => (
              <li key={item.id}>
                <div className={styles['item-head']}>
                  <strong>{item.claim}</strong>
                  <Badge domain="neutral" variant="outline">
                    {humanizeToken(item.status)}
                  </Badge>
                </div>
                <p>{item.note}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="professional-fluency-title">
          <SectionHeader
            id="professional-fluency-title"
            title="AI Fluency"
            description="Mide outcomes reales por tipo de tarea; no existe un score universal."
            icon={Brain}
            domain="productivity"
          />
          <div className={styles['fluency-meta']}>
            <Badge domain="neutral" variant="outline">
              {humanizeToken(snapshot.aiFluency.status)}
            </Badge>
            <span>{snapshot.aiFluency.materialOutcomesLogged} outcomes materiales</span>
          </div>
          <ul className={styles['simple-list']}>
            {snapshot.aiFluency.taskFamilies.map((family) => (
              <li key={family.id}>
                <strong>{humanizeToken(family.id)}</strong>
                <p>Ruta actual: {family.route}</p>
                <small>{family.nextMeasurement}</small>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card aria-labelledby="professional-market-title">
        <SectionHeader
          id="professional-market-title"
          title="Mercado y límites"
          description="Geografía y frescura visibles; las muestras no se disfrazan de censo."
          icon={LineChart}
          domain="projects"
        />
        <div className={styles.columns}>
          <div>
            <h3>Señales</h3>
            <ul className={styles['bullet-list']}>
              {snapshot.market.signals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Qué todavía no sabemos con precisión</h3>
            <ul className={styles['bullet-list']}>
              {snapshot.market.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <footer className={styles.provenance}>
        <span>
          PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · observado{' '}
          {snapshot.source.observedAt}
        </span>
        <span>
          Snapshot derivado {snapshot.source.generatedAt}
          {data.stale ? ' · stale' : ' · vigente'}
        </span>
      </footer>
    </div>
  );
}
