import Link from 'next/link';

import type { CalendarAgendaView } from '@/types/calendar';

import styles from './AgendaBoard.module.scss';

const VIEWS: { id: CalendarAgendaView; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: '7', label: '7 días' },
  { id: '30', label: '30 días' },
];

export function AgendaViewSwitcher({ view }: { view: CalendarAgendaView }) {
  return (
    <nav className={styles.views} aria-label="Vista de agenda">
      {VIEWS.map((item) => (
        <Link
          key={item.id}
          href={`/agenda?view=${item.id}`}
          className={styles['view-link']}
          data-active={view === item.id}
          scroll={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
