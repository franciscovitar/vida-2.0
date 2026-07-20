import { CalendarClock, MapPin } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { calendarCategoryMeta } from '@/lib/constants/calendar';
import { domainVars } from '@/lib/constants/domains';
import { todayEvents } from '@/lib/mock-data';

import styles from './TodayAgenda.module.scss';

export function TodayAgenda() {
  const events = [...todayEvents].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <Card aria-labelledby="agenda-title">
      <SectionHeader
        id="agenda-title"
        title="Agenda de hoy"
        description="Eventos y bloques de tiempo."
        icon={CalendarClock}
        domain="productivity"
      />
      <ol className={styles.timeline}>
        {events.map((event) => {
          const meta = calendarCategoryMeta[event.category];
          return (
            <li key={event.id} className={styles.event} style={domainVars(meta.domain)}>
              <div className={styles.time}>
                <span className={`${styles.start} tabular`}>{event.start}</span>
                <span className={`${styles.end} tabular`}>{event.end}</span>
              </div>
              <span className={styles.marker} aria-hidden="true" />
              <div className={styles.body}>
                <p className={styles.name}>{event.title}</p>
                <div className={styles.meta}>
                  <span className={styles.category}>{meta.label}</span>
                  {event.location ? (
                    <span className={styles.location}>
                      <MapPin size={12} strokeWidth={2} aria-hidden="true" />
                      {event.location}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
