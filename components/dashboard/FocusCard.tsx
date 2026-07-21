import Link from 'next/link';
import { CalendarClock, Target } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { isCalendarHoyUnavailable } from '@/lib/calendar/errors';
import { formatDuration } from '@/lib/format';
import type { CalendarTodayPreview } from '@/types/calendar';

import styles from './FocusCard.module.scss';

function timeRange(start: string | null, end: string | null, allDay: boolean): string {
  if (allDay) return 'Día completo';
  if (start && end) return `${start} – ${end}`;
  return start ?? '—';
}

export function FocusCard({ calendar }: { calendar: CalendarTodayPreview }) {
  if (isCalendarHoyUnavailable(calendar.status)) {
    return (
      <Card compact aria-labelledby="focus-title">
        <div className={styles.head}>
          <span className={styles.icon} aria-hidden="true">
            <Target size={16} strokeWidth={2} />
          </span>
          <h2 id="focus-title" className={styles.heading}>
            Foco del día
          </h2>
        </div>
        <p className={styles.primary}>Calendar no disponible</p>
        <p className={styles.note} role="status">
          {calendar.notice ?? 'No se pudieron cargar los eventos de hoy.'}
        </p>
        <p className={styles.footer}>
          <Link href="/agenda?view=today" className={styles.link}>
            Ver agenda completa
          </Link>
        </p>
      </Card>
    );
  }

  const { focus } = calendar;
  let title = 'Foco del día';
  let primary = '';
  const lines: string[] = [];

  if (focus.status === 'in-event' && focus.currentEvent) {
    title = 'Evento en curso';
    primary = focus.currentEvent.title;
    lines.push(
      timeRange(
        focus.currentEvent.startTime,
        focus.currentEvent.endTime,
        focus.currentEvent.allDay,
      ),
    );
    if (focus.minutesRemaining !== null) {
      lines.push(`Restan ${formatDuration(focus.minutesRemaining)}`);
    }
    if (focus.currentEvent.location) {
      lines.push(focus.currentEvent.location);
    }
    if (focus.nextEvent) {
      lines.push(
        `Después: ${focus.nextEvent.title}${focus.nextEvent.startTime ? ` · ${focus.nextEvent.startTime}` : ''}`,
      );
    }
  } else if (focus.status === 'between-events' && focus.nextEvent) {
    title = 'Entre eventos';
    primary = focus.nextEvent.title;
    if (focus.nextEvent.startTime) {
      lines.push(`Comienza a las ${focus.nextEvent.startTime}`);
    }
    if (focus.minutesUntilNext !== null) {
      lines.push(`En ${formatDuration(focus.minutesUntilNext)}`);
    }
    if (focus.nextFreeBlock) {
      lines.push(
        `Libre hasta entonces: ${focus.nextFreeBlock.startTime} – ${focus.nextFreeBlock.endTime}`,
      );
    }
  } else if (focus.status === 'free') {
    title = 'Sin más eventos';
    primary = 'No quedan eventos para hoy';
    if (focus.nextFreeBlock) {
      lines.push(
        `Próximo bloque libre: ${focus.nextFreeBlock.startTime} – ${focus.nextFreeBlock.endTime}`,
      );
    }
    if (focus.remainingFreeMinutes !== null) {
      lines.push(`Tiempo libre restante: ${formatDuration(focus.remainingFreeMinutes)}`);
    }
  } else {
    title = 'Día libre';
    primary = 'Día sin eventos programados';
    if (focus.nextFreeBlock) {
      lines.push(
        `Bloque libre principal: ${focus.nextFreeBlock.startTime} – ${focus.nextFreeBlock.endTime}`,
      );
    }
  }

  return (
    <Card compact aria-labelledby="focus-title">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Target size={16} strokeWidth={2} />
        </span>
        <h2 id="focus-title" className={styles.heading}>
          {title}
        </h2>
      </div>
      <p className={styles.primary}>{primary}</p>
      {lines.length > 0 ? (
        <ul className={styles.secondary}>
          {lines.map((item) => (
            <li key={item} className={styles.item}>
              <span className={styles.dot} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {calendar.source === 'mock' ? (
        <p className={styles.note} role="status">
          Fuente Calendar: datos simulados
        </p>
      ) : null}
      <p className={styles.footer}>
        <Link href="/agenda?view=today" className={styles.link}>
          <CalendarClock size={14} strokeWidth={2} aria-hidden="true" />
          Ver agenda completa
        </Link>
      </p>
    </Card>
  );
}
