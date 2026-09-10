import { Bike, Footprints, Gauge, Trophy } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { GymCardioContributionKind, GymWeeklyCardioSummary } from '@/types/gym';

import styles from './GymWeeklyCardio.module.scss';

type ProgressStyle = CSSProperties & { '--cardio-progress': string };

type Group = {
  kind: GymCardioContributionKind;
  label: string;
  icon: ReactNode;
  metMinutes: number;
  sessions: number;
};

function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function groupContributions(summary: GymWeeklyCardioSummary): Group[] {
  const definitions: readonly Omit<Group, 'metMinutes' | 'sessions'>[] = [
    { kind: 'bike', label: 'Bicicleta', icon: <Bike size={18} aria-hidden="true" /> },
    { kind: 'football', label: 'Fútbol', icon: <Trophy size={18} aria-hidden="true" /> },
    { kind: 'walking', label: 'Pasos / caminata', icon: <Footprints size={18} aria-hidden="true" /> },
  ];

  return definitions
    .map((definition) => {
      const items = summary.contributions.filter((item) => item.kind === definition.kind);
      return {
        ...definition,
        metMinutes: Math.round(items.reduce((sum, item) => sum + item.metMinutes, 0)),
        sessions: items.length,
      };
    })
    .filter((group) => group.metMinutes > 0);
}

export function GymWeeklyCardio({
  summary,
}: {
  summary: GymWeeklyCardioSummary | null | undefined;
}) {
  if (!summary) return null;
  const groups = groupContributions(summary);
  const cappedProgress = Math.min(summary.progressPercent, 100);
  const progressStyle = { '--cardio-progress': `${cappedProgress}%` } as ProgressStyle;
  const equivalentGoalDone = summary.totalMetMinutes >= summary.targetMetMinutes;
  const planDone =
    summary.remainingSteps === 0 &&
    summary.remainingBikeMinutes === 0 &&
    summary.remainingFootballMatches === 0;

  return (
    <Card aria-labelledby="gym-cardio-week-title">
      <SectionHeader
        id="gym-cardio-week-title"
        title="Cardio semanal"
        description="Tu plan base: 8.000 pasos por día + 120 min de bici + 1 partido. MET-min permite compararlos en una unidad común."
        domain="health"
      />

      <div className={styles.layout} data-complete={equivalentGoalDone}>
        <section className={styles.primary}>
          <div className={styles['score-line']}>
            <div>
              <span>Carga equivalente esta semana</span>
              <strong className="tabular">
                {number(summary.totalMetMinutes)} / {number(summary.targetMetMinutes)}
              </strong>
              <small>MET-min equivalentes</small>
            </div>
            <div className={styles.badge} data-complete={equivalentGoalDone}>
              <Gauge size={17} aria-hidden="true" />
              <span>
                {equivalentGoalDone ? 'Carga equivalente cubierta' : `${summary.progressPercent}%`}
              </span>
            </div>
          </div>

          <div className={styles.track} style={progressStyle} aria-hidden="true">
            <span />
          </div>

          <div className={styles.meta}>
            <span>
              {equivalentGoalDone
                ? `${number(summary.totalMetMinutes - summary.targetMetMinutes)} MET-min por encima de la referencia del plan`
                : `Faltan ${number(summary.remainingMetMinutes)} MET-min equivalentes`}
            </span>
            <span>≈ {number(summary.moderateEquivalentMinutes)} min a 4 MET acumulados</span>
          </div>
        </section>

        <div className={styles.groups}>
          {groups.length > 0 ? (
            groups.map((group) => (
              <article key={group.kind} className={styles.group} data-kind={group.kind}>
                <span className={styles.icon}>{group.icon}</span>
                <div>
                  <small>{group.label}</small>
                  <strong className="tabular">{number(group.metMinutes)} MET-min</strong>
                  <span>
                    {group.sessions} aporte{group.sessions === 1 ? '' : 's'} computado
                    {group.sessions === 1 ? '' : 's'}
                  </span>
                </div>
              </article>
            ))
          ) : (
            <p className={styles.empty}>Todavía no hay actividad computable esta semana.</p>
          )}
        </div>
      </div>

      <section className={styles.plan} aria-label="Cumplimiento del plan semanal de cardio">
        <div className={styles['plan-heading']}>
          <div>
            <strong>Tu plan real</strong>
            <span>{planDone ? 'Objetivos base cubiertos' : 'Lo que falta según lo registrado'}</span>
          </div>
          <span className={styles['plan-status']} data-complete={planDone}>
            {planDone ? 'Completo' : 'En curso'}
          </span>
        </div>

        <div className={styles['plan-grid']}>
          <article>
            <Footprints size={18} aria-hidden="true" />
            <div>
              <small>Pasos</small>
              <strong className="tabular">
                {number(summary.weeklySteps)} / {number(summary.weeklyStepsTarget)}
              </strong>
              <span>
                {summary.remainingSteps > 0
                  ? `Faltan ${number(summary.remainingSteps)} pasos`
                  : 'Objetivo semanal cubierto'}
              </span>
            </div>
          </article>

          <article>
            <Bike size={18} aria-hidden="true" />
            <div>
              <small>Bicicleta</small>
              <strong className="tabular">
                {number(summary.weeklyBikeMinutes, 1)} / {number(summary.weeklyBikeMinutesTarget)} min
              </strong>
              <span>
                {summary.remainingBikeMinutes > 0
                  ? `Faltan ${number(summary.remainingBikeMinutes, 1)} min`
                  : 'Objetivo semanal cubierto'}
              </span>
            </div>
          </article>

          <article>
            <Trophy size={18} aria-hidden="true" />
            <div>
              <small>Fútbol</small>
              <strong className="tabular">
                {number(summary.weeklyFootballMatches)} / {number(summary.weeklyFootballMatchesTarget)} partido
              </strong>
              <span>
                {summary.remainingFootballMatches > 0
                  ? `Faltan ${number(summary.remainingFootballMatches)} partido(s)`
                  : 'Objetivo semanal cubierto'}
              </span>
            </div>
          </article>
        </div>
      </section>

      {!equivalentGoalDone ? (
        <section className={styles.equivalences} aria-label="Equivalencias de la carga restante">
          <strong>Si cubrieras toda la carga equivalente que falta con una sola modalidad:</strong>
          <div>
            <span>≈ {number(summary.remainingEquivalentSteps)} pasos</span>
            <span>o {number(summary.remainingEquivalentBikeMinutes)} min de bici tipo Zona 2</span>
            <span>
              o {number(summary.remainingEquivalentFootballMatches, 1)} partidos de referencia de 60 min
            </span>
          </div>
          <small>Son equivalencias de carga, no una recomendación de reemplazar tu plan base.</small>
        </section>
      ) : null}

      <details className={styles.details}>
        <summary>Cómo se calcula</summary>
        <div>
          <p>{summary.note}</p>
          {summary.estimatedWalkingDays > 0 ? (
            <p>
              En {summary.estimatedWalkingDays} día(s) hubo pasos pero faltó velocidad/distancia
              usable; esos pasos sí se sumaron usando el proxy promedio indicado arriba.
            </p>
          ) : null}
          {summary.contributions.length > 0 ? (
            <ul>
              {summary.contributions.map((item) => (
                <li key={item.key}>
                  <strong>{item.label}</strong> · {number(item.durationMinutes, 1)} min ×{' '}
                  {number(item.met, 1)} MET = {number(item.metMinutes)} MET-min · confianza{' '}
                  {item.confidence === 'high'
                    ? 'alta'
                    : item.confidence === 'medium'
                      ? 'media'
                      : 'baja'}
                  . {item.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </Card>
  );
}
