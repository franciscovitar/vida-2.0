import type { DayCellState, HabitCalendarDay } from '@/types/domain-pages';
import { AUTHORIZED_HABIT_META } from '@/lib/habits/authorized';

import styles from './HabitMatrix.module.scss';

const SHORT: Record<string, string> = Object.fromEntries(
  AUTHORIZED_HABIT_META.map((item) => [
    item.header,
    item.name.split(' ')[0].slice(0, 3).normalize('NFD').replaceAll(/\p{M}/gu, ''),
  ]),
);

function stateLabel(state: DayCellState): string {
  if (state === 'done') return 'cumplido';
  if (state === 'missed') return 'no cumplido';
  if (state === 'pending') return 'pendiente';
  if (state === 'unavailable' || state === 'future') return 'no disponible';
  return 'sin datos';
}

export function HabitMatrix({ days, habitIds }: { days: HabitCalendarDay[]; habitIds: string[] }) {
  // En móvil mostrar últimos 14 días de la ventana para legibilidad.
  const visible = days.length > 14 ? days.slice(-14) : days;

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll} role="table" aria-label="Matriz de cumplimiento">
        <div className={styles.row} role="row">
          <span className={styles.corner} role="columnheader">
            Día
          </span>
          {habitIds.map((id) => (
            <span key={id} className={styles.head} role="columnheader" title={id}>
              {SHORT[id] ?? id.slice(0, 3)}
            </span>
          ))}
        </div>
        {visible.map((day) => (
          <div key={day.date} className={styles.row} role="row">
            <span className={styles.date} role="rowheader">
              {day.label}
            </span>
            {habitIds.map((id) => {
              const state = day.cells[id] ?? 'unavailable';
              return (
                <span
                  key={id}
                  className={styles.cell}
                  data-state={state}
                  role="cell"
                  title={`${day.label} · ${id}: ${stateLabel(state)}`}
                  aria-label={`${day.label}, ${id}, ${stateLabel(state)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <ul className={styles.legend} aria-label="Leyenda">
        <li>
          <span data-state="done" /> Cumplido
        </li>
        <li>
          <span data-state="missed" /> No cumplido
        </li>
        <li>
          <span data-state="pending" /> Pendiente
        </li>
        <li>
          <span data-state="unavailable" /> No disponible
        </li>
      </ul>
    </div>
  );
}
