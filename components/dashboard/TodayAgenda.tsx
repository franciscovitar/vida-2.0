import Link from 'next/link';
import { CalendarClock, MapPin } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { isCalendarHoyUnavailable } from '@/lib/calendar/errors';
import { formatDuration } from '@/lib/format';
import type { CalendarEvent, CalendarTodayPreview } from '@/types/calendar';

import styles from './TodayAgenda.module.scss';

function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'Día completo';
  if (event.startTime && event.endTime) return `${event.startTime} – ${event.endTime}`;
  return event.startTime ?? '—';
}

function durationLabel(event: CalendarEvent): string {
  if (event.allDay) return 'Día completo';
  if (event.durationMinutes === null) return '—';
  return formatDuration(event.durationMinutes);
}

function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <li
      className={styles.event}
      data-allday={event.allDay}
      data-overlap={event.overlaps}
      data-blocks={event.blocksTime}
    >
      <div className={styles.time}>
        {event.allDay ? (
          <span className={`${styles.start} tabular`}>Todo el día</span>
        ) : (
          <>
            <span className={`${styles.start} tabular`}>{event.startTime ?? '—'}</span>
            <span className={`${styles.end} tabular`}>{event.endTime ?? '—'}</span>
          </>
        )}
      </div>
      <span className={styles.marker} aria-hidden="true" data-overlap={event.overlaps} />
      <div className={styles.body}>
        <p className={styles.name}>{event.title}</p>
        <div className={styles.meta}>
          <span className={styles.category}>{eventTimeLabel(event)}</span>
          <span className={styles.duration}>{durationLabel(event)}</span>
          {event.location ? (
            <span className={styles.location}>
              <MapPin size={12} strokeWidth={2} aria-hidden="true" />
              {event.location}
            </span>
          ) : null}
          {event.status === 'tentative' ? <span>Tentativo</span> : null}
          {event.allDay ? <span>Día completo</span> : null}
          {event.blocksTime ? <span>Bloquea tiempo</span> : <span>No bloquea</span>}
          {event.overlaps ? <span className={styles.conflict}>Solapamiento</span> : null}
        </div>
      </div>
    </li>
  );
}

export function TodayAgenda({ calendar }: { calendar: CalendarTodayPreview }) {
  if (isCalendarHoyUnavailable(calendar.status)) {
    return (
      <Card aria-labelledby="agenda-title">
        <SectionHeader
          id="agenda-title"
          title="Agenda de hoy"
          description="Google Calendar · solo lectura."
          icon={CalendarClock}
          domain="productivity"
        />
        <p className={styles.notice} role="status">
          {calendar.notice ?? 'Calendar no disponible. El resto de Hoy sigue activo.'}
        </p>
        <p className={styles.footer}>
          <Link href="/agenda?view=today">Ver agenda completa</Link>
        </p>
      </Card>
    );
  }

  const allDay = calendar.todayEvents.filter((event) => event.allDay);
  const timed = calendar.todayEvents.filter((event) => !event.allDay);
  const empty = calendar.todayEvents.length === 0;

  return (
    <Card aria-labelledby="agenda-title">
      <SectionHeader
        id="agenda-title"
        title="Agenda de hoy"
        description={
          calendar.source === 'google'
            ? `${calendar.timezone} · solo lectura.`
            : 'Datos simulados · solo lectura.'
        }
        icon={CalendarClock}
        domain="productivity"
      />

      {calendar.notice && calendar.status === 'empty' ? (
        <p className={styles.notice} role="status">
          {calendar.notice}
        </p>
      ) : null}

      {calendar.source === 'mock' ? (
        <p className={styles.notice} role="status">
          Fuente Calendar: datos simulados (no es Google real).
        </p>
      ) : null}

      {empty ? (
        <p className={styles.empty}>No hay eventos programados para hoy.</p>
      ) : (
        <div className={styles.stack}>
          {allDay.length > 0 ? (
            <div>
              <p className={styles.group}>Día completo</p>
              <ol className={styles.timeline}>
                {allDay.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ol>
            </div>
          ) : null}
          {timed.length > 0 ? (
            <div>
              {allDay.length > 0 ? <p className={styles.group}>Con horario</p> : null}
              <ol className={styles.timeline}>
                {timed.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}

      <p className={styles.footer}>
        <Link href="/agenda?view=today">Ver agenda completa</Link>
      </p>
    </Card>
  );
}
