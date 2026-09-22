import { Bot, ShieldCheck, Users } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type {
  CareerResilienceConfidence,
  CareerResilienceData,
  CareerResilienceHorizonKey,
} from '@/types/career-resilience';

import styles from './ProfessionalDashboard.module.scss';

const HORIZONS: Array<{ key: CareerResilienceHorizonKey; label: string }> = [
  { key: 'Y1', label: '1 año' },
  { key: 'Y5', label: '5 años' },
  { key: 'Y10', label: '10 años' },
  { key: 'Y20', label: '20 años' },
];

const CONFIDENCE_LABELS: Record<CareerResilienceConfidence, string> = {
  LOW: 'baja',
  MEDIUM: 'media',
  MEDIUM_HIGH: 'media-alta',
  HIGH: 'alta',
};

const DEMAND_LABELS: Record<string, string> = {
  POSITIVE_BUT_TRANSFORMING: 'Demanda positiva, rol cambiando',
  STRONG_POSITIVE_BUT_SELF_AUTOMATING: 'Demanda fuerte, pero se autoautomatiza',
  PRESSURE_ON_ROUTINE_TASKS: 'Presión sobre lo rutinario',
  NOT_STANDARD_EMPLOYMENT_ROLE: 'No es un empleo estándar',
};

function formatRange([low, high]: readonly [number, number], suffix = '%') {
  return `${low}–${high}${suffix}`;
}

export function CareerResilience({ data }: { data: CareerResilienceData }) {
  if (data.status !== 'ready' || !data.snapshot) {
    return (
      <Card aria-labelledby="career-resilience-unavailable-title">
        <SectionHeader
          id="career-resilience-unavailable-title"
          title="Resiliencia profesional ante IA"
          description="No mostramos estimaciones si falta o se rompe la fuente canónica."
          icon={ShieldCheck}
          domain="projects"
        />
        <p className={styles['resilience-notice']}>{data.notice}</p>
      </Card>
    );
  }

  const snapshot = data.snapshot;
  const sourceById = new Map(snapshot.sources.map((source) => [source.id, source]));

  return (
    <Card aria-labelledby="career-resilience-title">
      <SectionHeader
        id="career-resilience-title"
        title="Resiliencia profesional ante IA"
        description="Qué tan defendible sigue siendo cada trabajo si vos te mantenés muy actualizado y usás IA de forma avanzada."
        icon={ShieldCheck}
        domain="projects"
      />

      {data.notice ? <p className={styles['resilience-notice']}>{data.notice}</p> : null}

      <div className={styles['resilience-intro']}>
        <p>{snapshot.statement}</p>
        <div className={styles['resilience-definition-grid']}>
          <div>
            <Bot size={17} aria-hidden="true" />
            <strong>IA sola</strong>
            <span>
              Rango de escenario de que la IA pueda producir la mayor parte del valor del rol con
              supervisión humana mínima.
            </span>
          </div>
          <div>
            <ShieldCheck size={17} aria-hidden="true" />
            <strong>Resiliencia AI-native</strong>
            <span>
              Índice 0–100 de qué tan defendible sigue siendo para alguien que usa muy bien la IA y
              se mueve hacia trabajo de alto contexto y responsabilidad.
            </span>
          </div>
          <div>
            <Users size={17} aria-hidden="true" />
            <strong>Compresión de equipo</strong>
            <span>
              Índice 0–100 de riesgo de que el rol siga existiendo, pero hagan falta menos personas
              para producir lo mismo.
            </span>
          </div>
        </div>
        <p className={styles['resilience-warning']}>
          Los porcentajes de “IA sola” son <strong>escenarios no calibrados</strong>: no son la
          probabilidad de que vos pierdas tu trabajo. A 10 y 20 años la incertidumbre es mucho
          mayor.
        </p>
      </div>

      <div className={styles['resilience-grid']}>
        {snapshot.roles.map((role) => (
          <details className={styles['resilience-role']} key={role.id}>
            <summary>
              <div>
                <strong>{role.name}</strong>
                <span>{role.aiTransformation}</span>
              </div>
              <Badge domain="projects" variant="outline">
                {DEMAND_LABELS[role.demand.direction] ?? role.demand.direction.toLowerCase()}
              </Badge>
            </summary>

            <div className={styles['resilience-role-body']}>
              <div className={styles['resilience-horizons']}>
                {HORIZONS.map(({ key, label }) => {
                  const item = role.horizons[key];
                  return (
                    <article key={key} className={styles['resilience-horizon']}>
                      <div className={styles['resilience-horizon-head']}>
                        <strong>{label}</strong>
                        <span>confianza {CONFIDENCE_LABELS[item.confidence]}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>IA sola</dt>
                          <dd>{formatRange(item.aiAloneSubstitutionPressurePctRange)}</dd>
                        </div>
                        <div>
                          <dt>Resiliencia AI-native</dt>
                          <dd>{formatRange(item.aiNativeResilienceIndexRange, '/100')}</dd>
                        </div>
                        <div>
                          <dt>Compresión</dt>
                          <dd>{formatRange(item.headcountCompressionIndexRange, '/100')}</dd>
                        </div>
                      </dl>
                      <p>{item.summary}</p>
                    </article>
                  );
                })}
              </div>

              <div className={styles['resilience-detail-grid']}>
                <section>
                  <h4>Por qué todavía necesita humanos</h4>
                  <ul>
                    {role.loadBearingHumanWork.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>Cómo protegerte</h4>
                  <ul>
                    {role.protectionPlaybook.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </div>

              <details className={styles['resilience-more']}>
                <summary>Ver evidencia y señales que cambiarían el pronóstico</summary>
                <div className={styles['resilience-evidence']}>
                  <div>
                    <h4>Demanda actual</h4>
                    <ul>
                      {role.demand.facts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Subiría el riesgo si…</h4>
                    <ul>
                      {role.riskUpSignposts.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Bajaría el riesgo si…</h4>
                    <ul>
                      {role.riskDownSignposts.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles['resilience-sources']}>
                    <h4>Fuentes</h4>
                    {role.sourceRefs.map((ref) => {
                      const source = sourceById.get(ref);
                      if (!source) return null;
                      return (
                        <a key={ref} href={source.url} target="_blank" rel="noreferrer">
                          {source.name}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </details>
            </div>
          </details>
        ))}
      </div>

      <details className={styles['resilience-more']}>
        <summary>Qué haría para protegerme en cualquier camino</summary>
        <ul className={styles['detail-list']}>
          {snapshot.globalProtectionStrategy.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>

      <div className={styles.provenance}>
        <span>
          Actualizado {snapshot.source.observedAt} · fuente canónica PAS main@
          <code>{snapshot.source.commit.slice(0, 7)}</code>
        </span>
        <span>Escenarios, no garantías.</span>
      </div>
    </Card>
  );
}
