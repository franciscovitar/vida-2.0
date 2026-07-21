import { formatDuration } from '@/lib/format';
import type { CalendarAgendaData, CalendarEvent } from '@/types/calendar';

import styles from './AgendaBoard.module.scss';

function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) {
    return event.multiDay ? `${event.startDate} → ${event.endDate}` : 'Día completo';
  }
  return `${event.startTime ?? '—'} – ${event.endTime ?? '—'}`;
}

function durationLabel(event: CalendarEvent): string {
  if (event.allDay) return event.multiDay ? 'Varios días' : 'Día completo';
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
      <div className={styles['event-time']}>
        <span className="tabular">{eventTimeLabel(event)}</span>
        <span className={styles.duration}>{durationLabel(event)}</span>
      </div>
      <div className={styles['event-body']}>
        <p className={styles['event-title']}>{event.title}</p>
        <div className={styles['event-meta']}>
          {event.calendarLabel ? <span>{event.calendarLabel}</span> : null}
          {event.location ? <span>{event.location}</span> : null}
          {event.allDay ? <span>Día completo</span> : null}
          {event.blocksTime ? <span>Bloquea tiempo</span> : <span>No bloquea</span>}
          {event.overlaps ? <span>Superpuesto</span> : null}
          {event.recurring ? <span>Recurrente</span> : null}
        </div>
      </div>
    </li>
  );
}

export function AgendaBoard({ data }: { data: CalendarAgendaData }) {
  const s = data.summary;

  return (
    <div className={styles.stack}>
      <section className={styles.summary} aria-labelledby="agenda-summary-title">
        <h2 id="agenda-summary-title" className={styles['section-title']}>
          Resumen
        </h2>
        <ul className={styles['summary-grid']}>
          <li>
            <strong className="tabular">{s.todayEventCount}</strong>
            <span>Hoy</span>
          </li>
          <li>
            <strong className="tabular">{formatDuration(s.occupiedMinutesToday)}</strong>
            <span>Ocupadas</span>
          </li>
          <li>
            <strong>{s.firstEvent?.title ?? '—'}</strong>
            <span>Primer evento</span>
          </li>
          <li>
            <strong>{s.lastEvent?.title ?? '—'}</strong>
            <span>Último evento</span>
          </li>
          <li>
            <strong>{s.nextEvent?.title ?? '—'}</strong>
            <span>Próximo</span>
          </li>
          <li>
            <strong className="tabular">{s.freeBlocksToday.length}</strong>
            <span>Bloques libres</span>
          </li>
          <li>
            <strong className="tabular">{s.overlapCountToday}</strong>
            <span>Superpuestos</span>
          </li>
        </ul>
      </section>

      <section className={styles.timeline} aria-labelledby="agenda-timeline-title">
        <h2 id="agenda-timeline-title" className={styles['section-title']}>
          Línea temporal de hoy
        </h2>
        {data.timelineToday.length === 0 ? (
          <p className={styles.empty}>No hay eventos para hoy.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {data.timelineToday.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
            {s.freeBlocksToday.length > 0 ? (
              <div className={styles.gaps}>
                <p className={styles['gaps-label']}>Espacios libres (8:00–22:00)</p>
                <ul className={styles['gaps-list']}>
                  {s.freeBlocksToday.map((block) => (
                    <li key={`${block.startTime}-${block.endTime}`}>
                      <span className="tabular">
                        {block.startTime} – {block.endTime}
                      </span>
                      <span>{formatDuration(block.durationMinutes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className={styles.days} aria-labelledby="agenda-days-title">
        <h2 id="agenda-days-title" className={styles['section-title']}>
          Agenda por día
        </h2>
        {data.days.map((day) => (
          <article key={day.date} className={styles.day} data-empty={day.empty}>
            <header className={styles['day-head']}>
              <h3 className={styles['day-title']}>{day.label}</h3>
              <p className={styles['day-meta']}>
                <span className="tabular">{day.events.length} eventos</span>
                <span className="tabular">{formatDuration(day.occupiedMinutes)} ocupadas</span>
                {day.conflictCount > 0 ? (
                  <span className="tabular">{day.conflictCount} en solape</span>
                ) : null}
              </p>
            </header>
            {day.empty ? (
              <p className={styles.empty}>Sin eventos este día.</p>
            ) : (
              <ul className={styles.list}>
                {day.events.map((event) => (
                  <EventRow key={`${day.date}-${event.id}`} event={event} />
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
