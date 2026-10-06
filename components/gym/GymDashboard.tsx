import { MonthlyReviewCard } from '@/components/domain/MonthlyReviewCard';
import { GymRoutineTabs } from '@/components/gym/GymRoutineTabs';
import { GymSummaryOverview } from '@/components/gym/GymSummaryOverview';
import { GymV2Overview } from '@/components/gym/GymV2Overview';
import { GymWeeklyCardio } from '@/components/gym/GymWeeklyCardio';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import type {
  GymDashboardData,
  GymDataSourceKind,
  GymDataSourceState,
  GymModuleStatus,
} from '@/types/gym';

import styles from './GymDashboard.module.scss';

const MODULE_STATUS_LABELS: Record<GymModuleStatus, string> = {
  ready: 'Lista',
  'flag-disabled': 'No habilitada',
  'not-configured': 'Sin configurar',
  empty: 'Sin rutina',
  ambiguous: 'Revisar rutina',
  forbidden: 'Rutina no disponible',
  partial: 'Disponible parcialmente',
  error: 'Temporalmente no disponible',
};

const SOURCE_KIND_LABELS: Record<GymDataSourceKind, string> = {
  notion: 'Rutina',
  sheets: 'Hábitos y métricas',
  calendar: 'Agenda',
  sessions: 'Registro de gimnasio',
};

const SOURCE_STATE_LABELS: Record<GymDataSourceState, string> = {
  ready: 'Disponible',
  mock: 'Simulada',
  unavailable: 'No disponible',
  error: 'Revisar',
  'not-applicable': 'No aplica',
  empty: 'Sin registros',
  disabled: 'Desactivada',
};

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
      <details className={styles.disclosure}>
        <summary>Ver estado de fuentes</summary>
        <p className={styles.body}>Estado del módulo: {MODULE_STATUS_LABELS[data.moduleStatus]}</p>
        <ul className={styles.sources}>
          {data.sources.map((source) => (
            <li key={source.kind}>
              <span className={styles['source-kind']}>{SOURCE_KIND_LABELS[source.kind]}</span>
              <Badge domain="neutral" variant="outline">
                {SOURCE_STATE_LABELS[source.state]}
              </Badge>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

export function GymDashboardView({ data }: { data: GymDashboardData }) {
  const hasUsefulContext = Boolean(
    data.readiness.sleep || data.readiness.energy || data.readiness.commitments.length > 0,
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
        <details className={styles['context-disclosure']}>
          <summary>
            <span>Contexto de Salud y agenda</span>
            <small>Opcional; no decide por vos ni modifica el plan.</small>
          </summary>
          <div className={styles['context-body']}>
            <div className={styles.metrics}>
              {data.readiness.sleep ? <span>Sueño: {data.readiness.sleep}</span> : null}
              {data.readiness.energy ? (
                <span>Señal fisiológica: {data.readiness.energy}</span>
              ) : null}
            </div>
            {data.readiness.commitments.length > 0 ? (
              <ul className={styles.notes}>
                {data.readiness.commitments.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
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

          <GymRoutineTabs
            routine={data.routine}
            sessions={data.sessions ?? []}
            summaries={data.sessionSummaries}
            today={data.targetDate}
          />
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
  const visibleSessions = data.sessionSummaries.slice(0, 6);
  const olderSessions = data.sessionSummaries.slice(6, 12);

  return (
    <div className={styles.stack}>
      <GymV2Overview
        sessions={data.sessions ?? []}
        summaries={data.sessionSummaries}
        weeklyTarget={data.weeklyTarget ?? null}
        today={data.targetDate}
      />

      <Card>
        <SectionHeader
          title="Historial de sesiones"
          description={data.sessionsPendingNotice}
          domain="health"
        />
        {visibleSessions.length === 0 ? (
          <p className={styles.body}>Sin sesiones registradas todavía.</p>
        ) : (
          <div className={styles['session-list']}>
            {visibleSessions.map((session) => (
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

            {olderSessions.length > 0 ? (
              <details className={styles['history-disclosure']}>
                <summary>Ver sesiones anteriores</summary>
                <div className={styles['history-list']}>
                  {olderSessions.map((session) => (
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
              </details>
            ) : null}
          </div>
        )}
      </Card>

      <MonthlyReviewCard domain="gym" compact />
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
