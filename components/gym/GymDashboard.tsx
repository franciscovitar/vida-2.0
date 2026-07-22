import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import { GymRoutineTabs } from '@/components/gym/GymRoutineTabs';
import type { GymDashboardData } from '@/types/gym';

import styles from './GymDashboard.module.scss';

export function GymDashboardView({ data }: { data: GymDashboardData }) {
  return (
    <div className={styles.stack}>
      <Card>
        <SectionHeader
          title={data.routine?.name ?? data.documentaryPage?.title ?? 'Gimnasio'}
          description={data.moduleNotice ?? 'Módulo read-only de rutina y contexto.'}
          domain="health"
        />
        <div className={styles.meta}>
          <Badge domain="health" variant="outline">
            {data.moduleStatus}
          </Badge>
          <span>
            Actualización:{' '}
            {data.routine?.lastUpdatedAt?.slice(0, 10) ??
              data.documentaryPage?.lastEditedAt?.slice(0, 10) ??
              '—'}
          </span>
          <span>Fuente: {data.routine?.sourceLabel ?? 'Notion (Registro Web)'}</span>
          <a href={data.areaHref} className={styles.link}>
            Área Salud
          </a>
        </div>
      </Card>

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

      {data.routine?.presentation === 'structured' ? (
        <Card>
          <SectionHeader title="Rutina" description="Prescripción desde Notion." domain="health" />
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
          title="Progreso disponible"
          description="Solo hechos y tendencias derivados de Sheets. Sin cargas ni récords inventados."
          domain="health"
        />
        <div className={styles.metrics}>
          {data.progress.map((metric) => (
            <MetricCard
              key={metric.key}
              label={metric.label}
              value={metric.value ?? '—'}
              unit={metric.unit ?? undefined}
              context={metric.context ?? undefined}
              domain="health"
              status={metric.kind === 'absent' ? 'neutral' : 'good'}
            />
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Sesiones estructuradas" />
        <p className={styles.body}>{data.sessionsPendingNotice}</p>
        {data.sessionSummaries.length === 0 ? (
          <p className={styles.body}>Sin historial de sesiones estructuradas.</p>
        ) : null}
      </Card>

      {data.warnings.length > 0 ? (
        <Card>
          <SectionHeader title="Advertencias" description="No bloquean el panel." />
          <ul className={styles.notes}>
            {data.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`} className={styles.warn}>
                {warning.subject ? `${warning.subject}: ` : null}
                {warning.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Estado de fuentes" />
        <ul className={styles.sources}>
          {data.sources.map((source) => (
            <li key={source.kind}>
              <span className={styles['source-kind']}>{source.kind}</span>
              <Badge domain="neutral" variant="outline">
                {source.state}
              </Badge>
              {source.notice ? (
                <span className={styles['source-notice']}>{source.notice}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
