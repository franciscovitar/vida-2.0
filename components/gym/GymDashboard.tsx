import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import { GymRoutineTabs } from '@/components/gym/GymRoutineTabs';
import { GymV2Overview } from '@/components/gym/GymV2Overview';
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

function publicSourceNotice(notice: string | null): string | null {
  if (!notice) return null;
  return notice
    .replace(/\s*\([^)]*[A-Z][A-Z0-9_]{3,}[^)]*\)\.?/g, '.')
    .replace(/\b[A-Z][A-Z0-9_]{3,}\b/g, 'configuración interna')
    .replace(/\s+\./g, '.')
    .trim();
}

export function GymDashboardView({ data }: { data: GymDashboardData }) {
  return (
    <div className={styles.stack}>
      <GymV2Overview
        sessions={data.sessions ?? []}
        summaries={data.sessionSummaries}
        weeklyTarget={data.weeklyTarget ?? null}
        today={data.targetDate}
      />

      {data.routine?.presentation === 'structured' ? (
        <Card>
          <SectionHeader
            title="Rutina actual"
            description="Prescripción desde Notion. Se mantiene separada del historial de rendimiento."
            domain="health"
          />
          <div className={styles.meta}>
            <span>{data.routine.name}</span>
            <span>
              Actualización: {data.routine.lastUpdatedAt?.slice(0, 10) ?? '—'}
            </span>
            <span>Fuente: {data.routine.sourceLabel}</span>
          </div>
          {data.routine.notes.length > 0 ? (
            <ul className={styles.notes}>
              {data.routine.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          <GymRoutineTabs routine={data.routine} />
        </Card>
      ) : null}

      {data.documentaryPage ? (
        <Card>
          <SectionHeader
            title="Vista documental"
            description="Estructura no normalizada con confianza; se evita inventar la rutina."
          />
          <ContentPageView page={data.documentaryPage} />
        </Card>
      ) : null}

      <Card>
        <SectionHeader
          title="Contexto de hoy"
          description={data.readiness.disclaimer}
          domain="health"
        />
        <div className={styles.meta}>
          <span>Sueño: {data.readiness.sleep ?? '—'}</span>
          <span>Energía: {data.readiness.energy ?? '—'}</span>
          <span>Ejercicio reciente: {data.readiness.recentExercise ?? '—'}</span>
          <span>Cobertura: {data.readiness.coverage ?? '—'}</span>
        </div>
        {data.readiness.commitments.length > 0 ? (
          <ul className={styles.notes}>
            {data.readiness.commitments.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.body}>Sin compromisos de Calendar relacionados.</p>
        )}
      </Card>

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

      {data.warnings.length > 0 ? (
        <Card>
          <SectionHeader title="Advertencias" description="No bloquean el panel." />
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
      ) : null}

      <Card>
        <SectionHeader
          title="Estado de datos"
          description={data.moduleNotice ?? 'Fuentes y cobertura del módulo.'}
        />
        <div className={styles.meta}>
          <Badge domain="health" variant="outline">
            {MODULE_STATUS_LABELS[data.moduleStatus]}
          </Badge>
          <a href={data.areaHref} className={styles.link}>
            Área Salud
          </a>
        </div>
        <ul className={styles.sources}>
          {data.sources.map((source) => {
            const notice = publicSourceNotice(source.notice);
            return (
              <li key={source.kind}>
                <span className={styles['source-kind']}>{SOURCE_KIND_LABELS[source.kind]}</span>
                <Badge domain="neutral" variant="outline">
                  {SOURCE_STATE_LABELS[source.state]}
                </Badge>
                {notice ? <span className={styles['source-notice']}>{notice}</span> : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
