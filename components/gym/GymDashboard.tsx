import { MonthlyReviewCard } from '@/components/domain/MonthlyReviewCard';
import { GymRoutineTabs } from '@/components/gym/GymRoutineTabs';
import { GymSummaryOverview } from '@/components/gym/GymSummaryOverview';
import { GymV2Overview } from '@/components/gym/GymV2Overview';
import { GymWeeklyCardio } from '@/components/gym/GymWeeklyCardio';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import type { GymDashboardData } from '@/types/gym';

import styles from './GymDashboard.module.scss';

function publicWarningSubject(subject: string | null): string | null {
  if (!subject) return null;
  const normalized = subject.toLowerCase();
  if (normalized === 'notion') return 'Rutina';
  if (normalized === 'sheets') return 'Métricas';
  if (normalized === 'calendar') return 'Agenda';
  if (normalized === 'sessions') return 'Registro';
  return subject;
}

function WarningCard({ data }: { data: GymDashboardData }) {
  if (data.warnings.length === 0) return null;

  return (
    <Card>
      <SectionHeader
        title="Hay información que conviene revisar"
        description="Sólo aparece cuando una fuente o lectura puede afectar lo que ves."
      />
      <ul className={styles.notes}>
        {data.warnings.map((warning, index) => {
          const subject = publicWarningSubject(warning.subject);
          return (
            <li key={`${warning.code}-${index}`} className={styles.warn}>
              {subject ? `${subject}: ` : null}
              {warning.message}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function GymDashboardView({ data }: { data: GymDashboardData }) {
  const hasUsefulContext = Boolean(
    data.readiness.sleep ||
      data.readiness.energy ||
      data.readiness.recentExercise ||
      data.readiness.commitments.length > 0,
  );

  return (
    <div className={styles.stack}>
      <GymSummaryOverview
        sessions={data.sessions ?? []}
        summaries={data.sessionSummaries}
        weeklyTarget={data.weeklyTarget ?? null}
        today={data.targetDate}
      />

      {hasUsefulContext ? (
        <Card>
          <SectionHeader
            title="Contexto útil de hoy"
            description="Contexto de Salud y agenda; no es un readiness score ni decide si entrenar."
            domain="health"
          />
          <div className={styles.metrics}>
            {data.readiness.sleep ? <span>Sueño: {data.readiness.sleep}</span> : null}
            {data.readiness.energy ? <span>Señal fisiológica: {data.readiness.energy}</span> : null}
            {data.readiness.recentExercise ? (
              <span>Actividad reciente: {data.readiness.recentExercise}</span>
            ) : null}
          </div>

          {data.readiness.commitments.length > 0 ? (
            <details className={styles.disclosure}>
              <summary>Ver compromisos relacionados</summary>
              <ul className={styles.notes}>
                {data.readiness.commitments.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      <WarningCard data={data} />
    </div>
  );
}

export function GymRoutineDashboardView({ data }: { data: GymDashboardData }) {
  return (
    <div className={styles.stack}>
      {data.routine?.presentation === 'structured' ? (
        <Card>
          <SectionHeader
            title="Rutina actual"
            description="Prescripción canónica desde Notion. El historial real se mantiene separado."
            domain="health"
          />
          <div className={styles.meta}>
            <span>{data.routine.name}</span>
            <span>Actualización: {data.routine.lastUpdatedAt?.slice(0, 10) ?? '—'}</span>
            <span>Fuente: {data.routine.sourceLabel}</span>
          </div>

          {data.routine.notes.length > 0 ? (
            <details className={styles.disclosure}>
              <summary>Prioridades y reglas del plan</summary>
              <ul className={styles.notes}>
                {data.routine.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <GymRoutineTabs routine={data.routine} />
        </Card>
      ) : data.documentaryPage ? (
        <Card>
          <SectionHeader
            title="Rutina actual"
            description="La fuente existe, pero todavía no puede estructurarse con confianza."
          />
          <ContentPageView page={data.documentaryPage} />
        </Card>
      ) : (
        <Card>
          <SectionHeader
            title="Rutina no disponible"
            description={data.moduleNotice ?? 'No se pudo leer la prescripción canónica de Notion.'}
          />
        </Card>
      )}

      <WarningCard data={data} />
    </div>
  );
}

export function GymProgressDashboardView({ data }: { data: GymDashboardData }) {
  return (
    <div className={styles.stack}>
      <GymV2Overview
        sessions={data.sessions ?? []}
        summaries={data.sessionSummaries}
        weeklyTarget={data.weeklyTarget ?? null}
        today={data.targetDate}
      />

      <MonthlyReviewCard domain="gym" />

      <Card>
        <SectionHeader
          title="Historial de sesiones"
          description={data.sessionsPendingNotice}
          domain="health"
        />
        {data.sessionSummaries.length === 0 ? (
          <p className={styles.body}>Sin sesiones registradas todavía.</p>
        ) : (
          <div className={styles['session-list']}>
            {data.sessionSummaries.slice(0, 12).map((session) => (
              <article key={session.key} className={styles.session}>
                <div>
                  <strong>{session.label ?? 'Entrenamiento'}</strong>
                  <span>{session.date}</span>
                </div>
                <div className={styles['session-meta']}>
                  {session.durationMinutes !== null ? (
                    <span>{session.durationMinutes} min</span>
                  ) : null}
                  <Badge domain="health" variant="outline">
                    {session.completed === true
                      ? 'completa'
                      : session.completed === false
                        ? 'incompleta'
                        : 'sin estado'}
                  </Badge>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <WarningCard data={data} />
    </div>
  );
}

export function GymCardioDashboardView({ data }: { data: GymDashboardData }) {
  return (
    <div className={styles.stack}>
      {data.weeklyCardio ? (
        <GymWeeklyCardio summary={data.weeklyCardio} />
      ) : (
        <Card>
          <SectionHeader
            title="Cardio semanal"
            description="No hay una lectura de cardio disponible en este momento."
            domain="health"
          />
        </Card>
      )}
      <WarningCard data={data} />
    </div>
  );
}
