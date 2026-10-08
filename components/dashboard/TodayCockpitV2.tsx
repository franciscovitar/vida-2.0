import {
  ArrowRight,
  CalendarClock,
  Compass,
  HeartPulse,
  History,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { isCalendarHoyUnavailable } from '@/lib/calendar/errors';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';
import type { TodayData } from '@/types';

import styles from './TodayCockpitV2.module.scss';

function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}` : value;
}

function metricValue(value: string, unit?: string): string {
  return unit ? `${value} ${unit}` : value;
}

export function TodayCockpitV2({
  today,
  orientation,
}: {
  today: TodayData;
  orientation: DailyOrientationView;
}) {
  const review = orientation.review;
  const nextEvent = isCalendarHoyUnavailable(today.calendar.status)
    ? null
    : today.calendar.nextEvent;

  return (
    <div className={styles.stack}>
      <Card aria-labelledby="today-attention-title">
        <SectionHeader
          id="today-attention-title"
          title="Atención hoy"
          description="Lo poco que realmente merece foco ahora."
          icon={Compass}
          domain="productivity"
          action={
            <Link href="/planificacion?view=prioridades" className={styles.link}>
              Ver planificación
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          }
        />

        {orientation.notice ? (
          <p className={styles.notice} role="status">
            {orientation.notice}
          </p>
        ) : null}

        {orientation.attention.length === 0 ? (
          <div className={styles.empty}>
            <strong>
              {review
                ? 'No cambiaría nada importante sólo para llenar el día.'
                : 'Todavía no hay una orientación V2 persistida para hoy.'}
            </strong>
            <p>
              El cockpit evita fabricar prioridades cuando la evidencia no justifica un ajuste.
            </p>
          </div>
        ) : (
          <ol className={styles.attention}>
            {orientation.attention.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <span className={styles.number}>{index + 1}</span>
                <div>
                  <div className={styles.row}>
                    <strong>{item.title}</strong>
                    <small>{item.confidence}</small>
                  </div>
                  <p>{item.recommendation}</p>
                  <span className={styles.why}>{item.why}</span>
                  {item.nextAction ? (
                    <span className={styles.next}>Próximo: {item.nextAction}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className={styles.grid}>
        <Card aria-labelledby="today-yesterday-title">
          <SectionHeader
            id="today-yesterday-title"
            title="Ayer"
            description="Qué cambió realmente, no cuántas horas llenaste."
            icon={History}
            domain="learning"
            action={
              <Link href="/planificacion?view=revision" className={styles.link}>
                Abrir revisión
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            }
          />

          {!review ? (
            <p className={styles.emptyText}>
              Sin revisión V2 persistida. No se reconstruye ayer desde suposiciones.
            </p>
          ) : (
            <div className={styles.review}>
              <div className={styles.reviewHeadline}>
                <span>{shortDate(review.date)}</span>
                <strong>{review.headline}</strong>
              </div>
              {review.items.length > 0 ? (
                <ul className={styles.reviewItems}>
                  {review.items.slice(0, 4).map((item, index) => (
                    <li key={`${item.domain}-${item.activity}-${index}`}>
                      <strong>{item.activity}</strong>
                      <span>{item.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.emptyText}>Sin cambios relevantes persistidos.</p>
              )}
            </div>
          )}
        </Card>

        <Card aria-labelledby="today-upcoming-title">
          <SectionHeader
            id="today-upcoming-title"
            title="Próximamente"
            description="Sólo compromisos y fechas capaces de cambiar una decisión."
            icon={CalendarClock}
            domain="tasks"
          />

          <div className={styles.upcoming}>
            {nextEvent ? (
              <div className={styles.nextEvent}>
                <span>Hoy</span>
                <strong>{nextEvent.title}</strong>
                <small>
                  {nextEvent.allDay
                    ? 'Día completo'
                    : nextEvent.startTime
                      ? `${nextEvent.startTime}${nextEvent.endTime ? `–${nextEvent.endTime}` : ''}`
                      : 'Horario no disponible'}
                </small>
              </div>
            ) : null}

            {orientation.upcoming.length > 0 ? (
              <ul className={styles.upcomingList}>
                {orientation.upcoming.slice(0, 4).map((item, index) => (
                  <li key={`${item.kind}-${item.title}-${index}`}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.reason}</span>
                    </div>
                    <small>{shortDate(item.date)}</small>
                  </li>
                ))}
              </ul>
            ) : nextEvent ? null : (
              <p className={styles.emptyText}>
                No hay una fecha próxima V2 que necesite ocupar este espacio.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card aria-labelledby="today-life-title">
        <SectionHeader
          id="today-life-title"
          title="Vida / capacidad"
          description="Señales para decidir carga; no un score de vida."
          icon={HeartPulse}
          domain="health"
          action={
            <Link href="/salud" className={styles.link}>
              Ver salud
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          }
        />

        <div className={styles.life}>
          <ul className={styles.metrics}>
            <li>
              <span>Sueño</span>
              <strong>{metricValue(today.summary.sleep.value, today.summary.sleep.unit)}</strong>
              <small>{today.summary.sleep.context}</small>
            </li>
            <li>
              <span>Energía</span>
              <strong>{metricValue(today.summary.energy.value, today.summary.energy.unit)}</strong>
              <small>{today.summary.energy.context}</small>
            </li>
            <li>
              <span>Movimiento</span>
              <strong>{metricValue(today.health.steps.value, today.health.steps.unit)}</strong>
              <small>{today.health.steps.context}</small>
            </li>
          </ul>

          {orientation.lifeSignals.length > 0 ? (
            <ul className={styles.lifeSignals}>
              {orientation.lifeSignals.slice(0, 4).map((signal, index) => (
                <li key={`${signal.kind}-${index}`} data-level={signal.level}>
                  <Sparkles size={14} aria-hidden="true" />
                  <span>
                    <strong>{signal.summary}</strong>
                    <small>
                      {signal.level} · confianza {signal.confidence}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyText}>
              Sin señal adicional de recuperación, ocio o capacidad que requiera atención.
            </p>
          )}
        </div>
      </Card>

      <nav className={styles.quickLinks} aria-label="Accesos rápidos desde Hoy">
        <Link href="/planificacion">Planificación</Link>
        <Link href="/aprendizaje">Aprendizaje</Link>
        <Link href="/proyectos">Proyectos</Link>
        <Link href="/habitos">Hábitos</Link>
      </nav>
    </div>
  );
}
