import { BookOpen, Brain, CircleAlert, Info, LineChart, Target, Workflow } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { IntelligenceEditorialData } from '@/types/intelligence-editorial';
import type { ProfessionalIntelligenceData } from '@/types/professional-intelligence';

import styles from './IntelligenceDashboard.module.scss';

function humanize(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function actionLabel(value: string): string {
  const map: Record<string, string> = {
    DO_NOW: 'hacer ahora',
    TRY: 'probar',
    WATCH: 'seguir mirando',
    NO_ACTION: 'sin acción',
  };
  return map[value] ?? humanize(value);
}

export function IntelligenceDashboard({
  editorial,
  professional,
}: {
  editorial: IntelligenceEditorialData;
  professional: ProfessionalIntelligenceData;
}) {
  if (
    editorial.status !== 'ready' ||
    !editorial.snapshot ||
    professional.status !== 'ready' ||
    !professional.snapshot
  ) {
    const notice =
      editorial.notice ??
      professional.notice ??
      'Inteligencia no está disponible porque falta una de sus fuentes canónicas.';

    return (
      <Card aria-labelledby="intelligence-unavailable-title">
        <SectionHeader
          id="intelligence-unavailable-title"
          title="Inteligencia"
          description="La vista falla cerrado: no inventa briefs ni recomendaciones si una fuente derivada es inválida."
          icon={CircleAlert}
          domain="productivity"
        />
        <div className={styles.notice} data-tone="warning" role="status">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      </Card>
    );
  }

  const e = editorial.snapshot;
  const p = professional.snapshot;
  const now = p.nowMoves[0] ?? null;
  const learn = p.priorities[0] ?? null;
  const trial = p.technologies.find((item) => item.disposition.includes('TRIAL')) ?? null;
  const assess = p.technologies.find((item) => item.disposition.includes('ASSESS')) ?? null;
  const hold = p.technologies.find((item) => item.disposition === 'HOLD') ?? null;
  const radarTech = p.technologies
    .filter((item) => item.disposition !== 'CURRENT_STACK')
    .slice(0, 4);

  return (
    <div className={styles.stack}>
      {editorial.notice || professional.notice ? (
        <div
          className={styles.notice}
          data-tone={editorial.stale || professional.stale ? 'warning' : 'info'}
          role="status"
        >
          {editorial.stale || professional.stale ? (
            <CircleAlert size={16} aria-hidden="true" />
          ) : (
            <Info size={16} aria-hidden="true" />
          )}
          <span>{editorial.notice ?? professional.notice}</span>
        </div>
      ) : null}

      <Card aria-labelledby="intelligence-radar-title">
        <SectionHeader
          id="intelligence-radar-title"
          title="Tu radar ahora"
          description="Sólo lo que cambia una decisión. No es otra lista para mantener."
          icon={Target}
          domain="productivity"
          action={
            <Badge domain="neutral" variant="outline">
              sin pendientes
            </Badge>
          }
        />
        <div className={styles.radar}>
          <article>
            <span>Ahora</span>
            <strong>{now?.title ?? 'Nada urgente'}</strong>
            <p>{now?.why ?? 'No hay una acción nueva que compita por atención.'}</p>
          </article>
          <article>
            <span>Desarrollar</span>
            <strong>{learn?.capability ?? 'Sin cambio'}</strong>
            <p>{learn?.action ?? 'Las prioridades profesionales siguen estables.'}</p>
          </article>
          <article>
            <span>Probar</span>
            <strong>{trial?.name ?? 'Nada todavía'}</strong>
            <p>
              {trial?.application ??
                (assess
                  ? `${assess.name} está en assess: primero necesita un caso real.`
                  : 'No hay una herramienta que justifique un experimento ahora.')}
            </p>
          </article>
          <article>
            <span>Ignorar por ahora</span>
            <strong>{hold?.name ?? 'Nada material'}</strong>
            <p>
              {hold?.application ??
                'No hace falta fabricar una recomendación negativa si no hay ruido relevante.'}
            </p>
          </article>
        </div>
      </Card>

      <Card aria-labelledby="intelligence-ai-title">
        <SectionHeader
          id="intelligence-ai-title"
          title="IA en ~2 minutos"
          description={e.aiBrief.periodLabel}
          icon={Brain}
          domain="productivity"
          action={
            <Badge domain="productivity" variant="outline">
              {actionLabel(e.aiBrief.action)}
            </Badge>
          }
        />

        <div className={styles['hero-brief']}>
          <div className={styles['reading-meta']}>
            <Badge domain="neutral" variant="outline">
              ~30 seg
            </Badge>
            <span>{e.aiBrief.readingMinutes} min si querés contexto</span>
          </div>
          <h3>{e.aiBrief.title}</h3>
          <p className={styles['big-thing']}>{e.aiBrief.oneBigThing}</p>
          <div className={styles['quick-decision']}>
            <strong>Por qué te importa</strong>
            <p>{e.aiBrief.whyItMatters}</p>
          </div>
          <div className={styles['quick-decision']}>
            <strong>Qué hacés</strong>
            <p>{e.aiBrief.actionText}</p>
          </div>
        </div>

        <details className={styles.details}>
          <summary>Leer el brief completo (~{e.aiBrief.readingMinutes} min)</summary>
          <div className={styles['details-body']}>
            <div className={styles['point-grid']}>
              {e.aiBrief.quickPoints.map((point) => (
                <article key={point.title}>
                  <strong>{point.title}</strong>
                  <p>{point.detail}</p>
                </article>
              ))}
            </div>

            <div className={styles.explainer}>
              <h3>Explicado fácil</h3>
              <p>{e.aiBrief.explainedSimply}</p>
            </div>

            <div className={styles.columns}>
              <div>
                <h3>Aplicado a vos</h3>
                <p>{e.aiBrief.appliedToUser}</p>
              </div>
              <div>
                <h3>Mucho ruido, poco cambio</h3>
                <p>{e.aiBrief.noiseFilter}</p>
              </div>
            </div>

            <div>
              <h3>Qué todavía no sabemos</h3>
              <ul className={styles.bullets}>
                {e.aiBrief.unknowns.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className={styles.sources}>
              <strong>Fuentes</strong>
              {e.aiBrief.sources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              ))}
            </div>
          </div>
        </details>
      </Card>

      <div className={styles.columns}>
        <Card aria-labelledby="intelligence-career-title">
          <SectionHeader
            id="intelligence-career-title"
            title="Carrera & Skills"
            description="Qué desarrollar ahora; no un roadmap infinito."
            icon={BookOpen}
            domain="learning"
            action={
              <Link href="/professional" className={styles['inline-link']}>
                Ver detalle
              </Link>
            }
          />
          <p className={styles.direction}>{p.forecast.direction}</p>
          <ol className={styles['priority-list']}>
            {p.priorities.slice(0, 3).map((item) => (
              <li key={item.rank}>
                <span>{item.rank}</span>
                <div>
                  <strong>{item.capability}</strong>
                  <p>{item.action}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles['no-study']}>
            <strong>La regla actual</strong>
            <p>
              No sumar cursos por reflejo: primero construir o verificar evidencia real cuando eso
              tenga más valor.
            </p>
          </div>
        </Card>

        <Card aria-labelledby="intelligence-tech-title">
          <SectionHeader
            id="intelligence-tech-title"
            title="Tech & Open Source Radar"
            description="Pocas opciones con uso concreto; popularidad no equivale a adopción."
            icon={Workflow}
            domain="productivity"
          />
          {radarTech.length ? (
            <ul className={styles['tech-list']}>
              {radarTech.map((item) => (
                <li key={item.id}>
                  <div className={styles['item-head']}>
                    <strong>{item.name}</strong>
                    <Badge
                      domain={item.disposition === 'HOLD' ? 'neutral' : 'productivity'}
                      variant="outline"
                    >
                      {humanize(item.disposition)}
                    </Badge>
                  </div>
                  <p>{item.application}</p>
                  <small>{item.priceLabel}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No hay candidato material esta semana.</p>
          )}
          <p className={styles.guardrail}>
            Repositorios open source entran sólo cuando resuelven un gap real y pasan mantenimiento,
            licencia, seguridad, costo de integración y overlap.
          </p>
        </Card>
      </div>

      <Card aria-labelledby="intelligence-pas-title">
        <SectionHeader
          id="intelligence-pas-title"
          title="Tu PAS está mejorando"
          description="Cambios que vas a notar, explicados sin jerga de repositorio."
          icon={LineChart}
          domain="projects"
        />
        <div className={styles['pas-grid']}>
          {e.pasUpdates.map((item) => (
            <article key={item.id}>
              <div className={styles['item-head']}>
                <strong>{item.title}</strong>
                <Badge domain="projects" variant="outline">
                  {humanize(item.status)}
                </Badge>
              </div>
              <p>
                <b>Antes:</b> {item.before}
              </p>
              <p>
                <b>Ahora:</b> {item.now}
              </p>
              <p>
                <b>Qué vas a notar:</b> {item.whatYouNotice}
              </p>
              <small>
                Acción tuya: {item.actionRequired} · costo: {item.costLabel}
              </small>
            </article>
          ))}
        </div>
      </Card>

      <footer className={styles.provenance}>
        <span>
          PAS <code>{e.source.commit.slice(0, 8)}</code> · editorial {e.source.observedAt}
        </span>
        <span>
          Sin pendientes de lectura ·{' '}
          {editorial.stale || professional.stale ? 'necesita refresh' : 'vigente'}
        </span>
      </footer>
    </div>
  );
}
