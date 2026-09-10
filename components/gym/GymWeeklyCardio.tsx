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
    { kind: 'walking', label: 'Caminata', icon: <Footprints size={18} aria-hidden="true" /> },
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
  const goalDone = summary.totalMetMinutes >= summary.targetMetMinutes;

  return (
    <Card aria-labelledby="gym-cardio-week-title">
      <SectionHeader
        id="gym-cardio-week-title"
        title="Cardio semanal"
        description="Una sola cuota para bici, fútbol y caminata usando duración × intensidad (MET-min)."
        domain="health"
      />

      <div className={styles.layout} data-complete={goalDone}>
        <section className={styles.primary}>
          <div className={styles['score-line']}>
            <div>
              <span>Esta semana</span>
              <strong className="tabular">
                {number(summary.totalMetMinutes)} / {number(summary.targetMetMinutes)}
              </strong>
              <small>MET-min</small>
            </div>
            <div className={styles.badge} data-complete={goalDone}>
              <Gauge size={17} aria-hidden="true" />
              <span>{goalDone ? 'Objetivo cubierto' : `${summary.progressPercent}%`}</span>
            </div>
          </div>

          <div className={styles.track} style={progressStyle} aria-hidden="true">
            <span />
          </div>

          <div className={styles.meta}>
            <span>
              {goalDone
                ? `${number(summary.totalMetMinutes - summary.targetMetMinutes)} MET-min por encima de la cuota`
                : `Faltan ${number(summary.remainingMetMinutes)} MET-min`}
            </span>
            <span>≈ {number(summary.moderateEquivalentMinutes)} min a 4 MET</span>
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
            <p className={styles.empty}>
              Todavía no hay actividad con duración e intensidad suficientes para convertir esta
              semana.
            </p>
          )}
        </div>
      </div>

      <details className={styles.details}>
        <summary>Cómo se calcula</summary>
        <div>
          <p>{summary.note}</p>
          {summary.uncreditedWalkingDays > 0 ? (
            <p>
              {summary.uncreditedWalkingDays} día(s) tuvieron pasos pero no datos suficientes para
              convertirlos de forma segura; esos pasos siguen contando como actividad general.
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
