import { CircleAlert, Info } from 'lucide-react';

import type { CareerResilienceData } from '@/types/career-resilience';
import type { ProfessionalIntelligenceData } from '@/types/professional-intelligence';
import type { ProfessionalMarketDetailData } from '@/types/professional-market-detail';

import styles from './ProfessionalV2.module.scss';

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

export function ProfessionalMarket({
  professional,
  careerResilience,
  marketDetail,
}: {
  professional: ProfessionalIntelligenceData;
  careerResilience: CareerResilienceData;
  marketDetail: ProfessionalMarketDetailData;
}) {
  if (professional.status !== 'ready' || !professional.snapshot) {
    return (
      <section className={styles.section} aria-labelledby="professional-market-unavailable">
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span id="professional-market-unavailable">
            {professional.notice ?? 'Mercado profesional no disponible.'}
          </span>
        </div>
      </section>
    );
  }

  const snapshot = professional.snapshot;
  const market = snapshot.market;
  const resilience = careerResilience.status === 'ready' ? careerResilience.snapshot : null;
  const detail =
    marketDetail.status === 'ready' && !marketDetail.stale ? marketDetail.snapshot : null;
  const targetRoles = detail
    ? detail.roles.filter((role) => detail.targetRoleIds.includes(role.id))
    : [];

  return (
    <div className={styles.market}>
      {professional.notice ? (
        <div
          className={styles.notice}
          data-tone={professional.stale ? 'warning' : 'info'}
          role="status"
        >
          {professional.stale ? (
            <CircleAlert size={16} aria-hidden="true" />
          ) : (
            <Info size={16} aria-hidden="true" />
          )}
          <span>{professional.notice}</span>
        </div>
      ) : null}

      {marketDetail.notice ? (
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{marketDetail.notice}</span>
        </div>
      ) : null}

      <section className={styles['market-hero']} aria-labelledby="professional-market-title">
        <p className={styles.eyebrow}>Mercado profesional · observado {market.observedAt}</p>
        <h2 id="professional-market-title">Dónde hay señal y qué significa</h2>
        <p>{market.headline}</p>
        <div className={styles['market-meta']}>
          <span>Argentina separada de referencias internacionales</span>
          <span>Roles objetivo sin ranking universal</span>
          <span>Sin score de empleabilidad ni remote fit</span>
        </div>
      </section>

      {detail ? (
        <section className={styles['market-section']} aria-labelledby="market-role-fit-title">
          <div className={styles['market-heading']}>
            <p className={styles.eyebrow}>Roles objetivo y barrera de entrada</p>
            <h3 id="market-role-fit-title">Mejor encaje actual, sin convertirlo en leaderboard</h3>
            <p>{detail.rule}</p>
          </div>

          <div className={styles['market-role-fit-grid']}>
            {targetRoles.map((role) => (
              <article className={styles['market-role-fit']} key={role.id}>
                <div className={styles['market-role-head']}>
                  <h4>{role.name}</h4>
                  <span>verificación personal pendiente</span>
                </div>
                <p>
                  Evidencia actual: {role.evidence.demonstrated} facetas demostradas ·{' '}
                  {role.evidence.practiced} practicadas.
                </p>
                {role.macroSignals.slice(0, 2).map((signal) => (
                  <p key={signal}>{signal}</p>
                ))}
                {role.remoteSamples.length > 0 ? (
                  <details className={styles['market-details']}>
                    <summary>Ver muestras remotas y límites</summary>
                    <div className={styles['market-role-list']}>
                      {role.remoteSamples.slice(0, 3).map((sample) => (
                        <article key={`${role.id}-${sample.sample}`}>
                          <span className={styles['market-kicker']}>
                            {sample.geography} · {sample.observedAt}
                          </span>
                          <p>{sample.sample}</p>
                        </article>
                      ))}
                      {role.unresolved.map((item) => (
                        <article key={item}>
                          <p>{item}</p>
                        </article>
                      ))}
                    </div>
                  </details>
                ) : null}
              </article>
            ))}
          </div>

          <div className={styles['market-seniority-grid']}>
            <article>
              <span className={styles['market-kicker']}>
                {detail.seniorityContext.geography} · {detail.seniorityContext.period}
              </span>
              <h4>Seniority local</h4>
              <dl className={styles['market-seniority-levels']}>
                {Object.entries(detail.seniorityContext.levels).map(([label, definition]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{definition}</dd>
                  </div>
                ))}
              </dl>
              <a href={detail.seniorityContext.sourceUrl} rel="noreferrer" target="_blank">
                {detail.seniorityContext.sourceLabel} →
              </a>
            </article>
            <article>
              <span className={styles['market-kicker']}>Cómo leer la entrada</span>
              <h4>No hay un “entry barrier score” universal</h4>
              <p>
                Las muestras remotas sirven para ver requisitos y seniority observados, no para
                estimar una probabilidad personal de contratación.
              </p>
              <p>{detail.seniorityContext.note}</p>
            </article>
          </div>
        </section>
      ) : null}

      <section className={styles['market-section']} aria-labelledby="market-demand-title">
        <div className={styles['market-heading']}>
          <p className={styles.eyebrow}>Demanda y crecimiento</p>
          <h3 id="market-demand-title">Señales estructurales</h3>
        </div>

        <div className={styles['market-signal-grid']}>
          {market.globalSignals.map((signal) => (
            <article className={styles['market-signal']} key={signal.id}>
              <div className={styles['market-kicker']}>
                {signal.geography} · {signal.period}
              </div>
              <strong>{signal.value}</strong>
              <h4>{signal.title}</h4>
              <p>{signal.explanation}</p>
              <a href={signal.sourceUrl} rel="noreferrer" target="_blank">
                {signal.sourceLabel} →
              </a>
            </article>
          ))}
        </div>

        <div className={styles['market-benchmark-list']}>
          {market.internationalBenchmarks.map((item) => (
            <article className={styles['market-benchmark']} key={item.id}>
              <div>
                <span className={styles['market-kicker']}>
                  {item.geography} · {item.period}
                </span>
                <h4>{item.role}</h4>
              </div>
              <dl className={styles['market-metrics']}>
                <div>
                  <dt>Crecimiento</dt>
                  <dd>+{item.employmentGrowthPercent}%</dd>
                </div>
                <div>
                  <dt>Aperturas/año</dt>
                  <dd>{formatInteger(item.annualOpenings)}</dd>
                </div>
                <div>
                  <dt>Mediana anual</dt>
                  <dd>{formatUsd(item.medianAnnualUsd)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {detail ? (
        <section className={styles['market-section']} aria-labelledby="market-skills-title">
          <div className={styles['market-heading']}>
            <p className={styles.eyebrow}>Skills con señal de mercado</p>
            <h3 id="market-skills-title">Qué capacidades merecen atención</h3>
            <p>
              Son señales direccionales y contextuales. No equivalen a una lista universal de
              skills ni reemplazan tu evidencia personal.
            </p>
          </div>
          <div className={styles['market-skill-grid']}>
            {detail.skillSignals.map((signal) => (
              <article className={styles['market-skill']} key={signal.id}>
                <span className={styles['market-kicker']}>
                  {signal.geography} · {signal.period}
                </span>
                <h4>{signal.label}</h4>
                <p>{signal.signal}</p>
                <a href={signal.sourceUrl} rel="noreferrer" target="_blank">
                  {signal.sourceLabel} →
                </a>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles['market-section']} aria-labelledby="market-compensation-title">
        <div className={styles['market-heading']}>
          <p className={styles.eyebrow}>Compensación · Argentina</p>
          <h3 id="market-compensation-title">Referencias salariales sin mezclar mercados</h3>
          <p>
            Son medianas brutas mensuales de la encuesta indicada. No son ofertas actuales ni una
            cotización salarial exacta.
          </p>
        </div>

        <div className={styles['market-salary-grid']}>
          {market.argentinaSalaryRoles.map((role) => (
            <article className={styles['market-salary-role']} key={role.id}>
              <div className={styles['market-role-head']}>
                <h4>{role.role}</h4>
                <span>{role.period}</span>
              </div>
              <ul>
                {role.points.map((point) => (
                  <li key={point.label}>
                    <span>{point.label}</span>
                    <strong>{formatArsMillions(point.medianArsGrossMonthly)}</strong>
                    <small>n={point.sampleSize}</small>
                  </li>
                ))}
              </ul>
              <a href={role.sourceUrl} rel="noreferrer" target="_blank">
                {role.sourceLabel} →
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className={styles['market-section']} aria-labelledby="market-geography-title">
        <div className={styles['market-heading']}>
          <p className={styles.eyebrow}>Geografía y remoto</p>
          <h3 id="market-geography-title">No comprimimos mercados distintos en un solo número</h3>
        </div>

        <div className={styles['market-geo-grid']}>
          <article>
            <strong>Argentina</strong>
            <p>
              Hay una referencia salarial local con seniority y tamaño de muestra visibles. Se usa
              para contexto local, no para inferir salarios internacionales.
            </p>
          </article>
          <article>
            <strong>Internacional</strong>
            <p>
              EE.UU. funciona como referencia estructural de crecimiento, aperturas y compensación.
              No se presenta como equivalente al mercado argentino.
            </p>
          </article>
          <article>
            <strong>Remoto / LATAM</strong>
            <p>
              {detail
                ? 'Hay muestras remotas acotadas por rol objetivo. Sirven como evidencia representativa, no como censo ni como remote-fit score.'
                : 'No hay una métrica comparable de remote fit. Hasta que exista evidencia suficiente, no publicamos un score ni una estimación.'}
            </p>
          </article>
        </div>
      </section>

      <section className={styles['market-section']} aria-labelledby="market-ai-title">
        <div className={styles['market-heading']}>
          <p className={styles.eyebrow}>IA y resiliencia profesional</p>
          <h3 id="market-ai-title">Transformación no significa desaparición automática</h3>
          <p>
            La resiliencia se muestra como escenarios e índices heurísticos. No son probabilidades
            personales de desempleo.
          </p>
        </div>

        {resilience ? (
          <>
            <div className={styles['market-finding-list']}>
              {resilience.crossRoleFindings.map((item) => (
                <article key={item.id}>
                  <p>{item.finding}</p>
                </article>
              ))}
            </div>

            <details className={styles['market-details']}>
              <summary>Ver transformación por rol</summary>
              <div className={styles['market-role-list']}>
                {resilience.roles.map((role) => (
                  <article key={role.id}>
                    <div className={styles['market-role-head']}>
                      <h4>{role.name}</h4>
                      <span>{role.demand.direction.replaceAll('_', ' ').toLowerCase()}</span>
                    </div>
                    <p>{role.aiTransformation}</p>
                    <div className={styles['market-role-horizon']}>
                      <strong>Escenario a 5 años</strong>
                      <span>{role.horizons.Y5.summary}</span>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          </>
        ) : (
          <div className={styles.notice} data-tone="warning" role="status">
            <CircleAlert size={16} aria-hidden="true" />
            <span>
              {careerResilience.notice ??
                'La capa de resiliencia ante IA no está disponible; no mostramos estimaciones.'}
            </span>
          </div>
        )}
      </section>

      <details className={styles['market-details']}>
        <summary>Cómo leer estos datos</summary>
        <ul className={styles['market-limitations']}>
          {market.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {detail?.commonGaps.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </details>

      <footer className={styles['market-provenance']}>
        PAS <code>{snapshot.source.commit.slice(0, 8)}</code> · mercado observado{' '}
        {market.observedAt}
        {detail ? (
          <>
            {' '}
            · roles <code>{detail.source.commit.slice(0, 8)}</code>
          </>
        ) : null}
        {resilience ? (
          <>
            {' '}
            · resiliencia <code>{resilience.source.commit.slice(0, 8)}</code>
          </>
        ) : null}
      </footer>
    </div>
  );
}
