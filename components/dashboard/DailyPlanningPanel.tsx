import { ListChecks } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type {
  DailyPlanningSourceView,
  DailyPlanningView,
  DailyPlanningViewItem,
} from '@/types/daily-planning-view';

import styles from './DailyPlanningPanel.module.scss';

function timeFromIso(value: string | null, timezone: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}` : value;
}

function ItemList({ items, empty }: { items: DailyPlanningViewItem[]; empty: string }) {
  if (items.length === 0) return <p className={styles.empty}>{empty}</p>;
  return (
    <ul className={styles['item-list']}>
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`}>
          <p className={styles['item-title']}>{item.title}</p>
          {item.meta ? <p className={styles.meta}>{item.meta}</p> : null}
          <p className={styles.reason}>{item.reason}</p>
        </li>
      ))}
    </ul>
  );
}

function SourceBadge({ source }: { source: DailyPlanningSourceView }) {
  return (
    <li data-available={source.available} title={source.notice ?? undefined}>
      <span>{source.label}</span>
      <strong>{source.status}</strong>
    </li>
  );
}

export function DailyPlanningPanel({ plan }: { plan: DailyPlanningView }) {
  const generated = timeFromIso(plan.planGeneratedAt, plan.timezone);
  const hasPlan = plan.planGeneratedAt !== null;
  const qualityCount =
    plan.quality.unresolvedPlanRefs +
    plan.quality.ambiguousTaskDates +
    plan.quality.calendarDateConflicts;

  return (
    <Card aria-labelledby="daily-plan-title">
      <SectionHeader
        id="daily-plan-title"
        title="Plan de hoy"
        description={
          generated
            ? `Inteligencia derivada · generado ${generated}. Los datos actuales mandan.`
            : 'Inteligencia derivada · todavía sin snapshot válido para hoy.'
        }
        icon={ListChecks}
        domain="productivity"
      />

      <div className={styles.stack}>
        {plan.notice ? (
          <p className={styles.notice} role="status">
            {plan.notice}
          </p>
        ) : null}

        <ul className={styles.summary} aria-label="Resumen del plan">
          <li>
            <strong>{plan.pendingCount}</strong>
            <span>pendientes operativos</span>
          </li>
          <li>
            <strong>{plan.blockedTasks.length}</strong>
            <span>bloqueadas</span>
          </li>
          <li>
            <strong>{qualityCount}</strong>
            <span>alertas de calidad clave</span>
          </li>
        </ul>

        <div className={styles.section}>
          <p className={styles.group}>Compromisos fijos</p>
          {plan.fixedCommitments.length === 0 ? (
            <p className={styles.empty}>No hay compromisos con horario verificables para hoy.</p>
          ) : (
            <ul className={styles.commitments}>
              {plan.fixedCommitments.map((event, index) => (
                <li key={`${event.title}-${event.startTime ?? 'none'}-${index}`}>
                  <span className={`${styles.time} tabular`}>
                    {event.startTime && event.endTime
                      ? `${event.startTime}–${event.endTime}`
                      : (event.startTime ?? '—')}
                  </span>
                  <span className={styles['commitment-body']}>
                    <strong>{event.title}</strong>
                    {event.location ? <small>{event.location}</small> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles['plan-grid']} data-empty={!hasPlan}>
          <section>
            <p className={styles.group}>MUST</p>
            <ItemList items={plan.must} empty="Sin MUST persistidos." />
          </section>
          <section>
            <p className={styles.group}>SHOULD</p>
            <ItemList items={plan.should} empty="Sin SHOULD persistidos." />
          </section>
          <section>
            <p className={styles.group}>COULD</p>
            <ItemList items={plan.could} empty="Sin COULD persistidos." />
          </section>
        </div>

        <div className={styles.section}>
          <p className={styles.group}>Bloques sugeridos</p>
          {plan.suggestedBlocks.length === 0 ? (
            <p className={styles.empty}>No hay bloques sugeridos persistidos para hoy.</p>
          ) : (
            <ol className={styles.blocks}>
              {plan.suggestedBlocks.map((block, index) => (
                <li key={`${block.start}-${block.end}-${block.item.title}-${index}`}>
                  <span className={`${styles.time} tabular`}>
                    {block.start}–{block.end}
                  </span>
                  <span className={styles['block-body']}>
                    <strong>{block.item.title}</strong>
                    <small>{block.item.reason}</small>
                  </span>
                  <span className={styles.suggestion}>Sugerido</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className={styles['two-col']}>
          <section>
            <p className={styles.group}>Versión mínima</p>
            <ItemList items={plan.minimumViable} empty="Sin versión mínima persistida." />
          </section>
          <section>
            <p className={styles.group}>NOT TODAY</p>
            <ItemList items={plan.notToday} empty="Nada excluido explícitamente." />
          </section>
        </div>

        <div className={styles['two-col']}>
          <section>
            <p className={styles.group}>Bloqueadas</p>
            {plan.blockedTasks.length === 0 ? (
              <p className={styles.empty}>No hay tareas bloqueadas verificadas.</p>
            ) : (
              <ul className={styles['simple-list']}>
                {plan.blockedTasks.map((task, index) => (
                  <li key={`${task.title}-${index}`}>
                    <strong>{task.title}</strong>
                    <span>{task.blocker ?? 'Bloqueo sin detalle'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <p className={styles.group}>Próximas fechas</p>
            {plan.dateMarkers.length === 0 ? (
              <p className={styles.empty}>No hay marcadores próximos verificables.</p>
            ) : (
              <ul className={styles['simple-list']}>
                {plan.dateMarkers.map((marker, index) => (
                  <li key={`${marker.title}-${marker.date}-${index}`}>
                    <strong>{marker.title}</strong>
                    <span>
                      {shortDate(marker.date)}
                      {marker.note ? ` · ${marker.note}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className={styles['source-section']}>
          <p className={styles.group}>Calidad de fuentes</p>
          <ul className={styles.sources}>
            {plan.sources.map((source) => (
              <SourceBadge key={source.label} source={source} />
            ))}
          </ul>
          <p className={styles.freshness}>
            Contexto factual actualizado {timeFromIso(plan.contextSyncedAt, plan.timezone) ?? '—'} ·
            Fecha objetivo {shortDate(plan.targetDate)}.
          </p>
          {plan.quality.missingTaskDurations > 0 || plan.quality.missingTaskPriorities > 0 ? (
            <p className={styles.freshness}>
              Datos blandos incompletos: {plan.quality.missingTaskDurations} sin duración y{' '}
              {plan.quality.missingTaskPriorities} sin prioridad. No se completan con supuestos.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
