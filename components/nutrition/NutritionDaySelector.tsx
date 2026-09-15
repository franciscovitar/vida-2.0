import Link from 'next/link';

import styles from './NutritionDaySelector.module.scss';

function addDays(date: string, delta: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + delta);
  return parsed.toISOString().slice(0, 10);
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function hrefFor(date: string, currentDate: string): string {
  return date === currentDate ? '/dieta' : `/dieta?date=${date}`;
}

export function NutritionDaySelector({
  dates,
  selectedDate,
  currentDate,
}: {
  dates: readonly string[];
  selectedDate: string;
  currentDate: string;
}) {
  const previous = addDays(selectedDate, -1);
  const next = addDays(selectedDate, 1);
  const canGoNext = next <= currentDate;
  const visibleDates = Array.from(new Set([...dates, selectedDate]))
    .filter((date) => date <= currentDate)
    .sort()
    .slice(-14);

  return (
    <nav className={styles.wrap} aria-label="Día de nutrición">
      <div className={styles.heading}>
        <div>
          <span>DÍA MOSTRADO</span>
          <strong>{selectedDate === currentDate ? 'Hoy' : longDate(selectedDate)}</strong>
        </div>
        <div className={styles.arrows}>
          <Link href={hrefFor(previous, currentDate)} aria-label="Ver día anterior">
            ←
          </Link>
          <Link className={styles.today} href="/dieta">
            Hoy
          </Link>
          {canGoNext ? (
            <Link href={hrefFor(next, currentDate)} aria-label="Ver día siguiente">
              →
            </Link>
          ) : (
            <span aria-hidden="true">→</span>
          )}
        </div>
      </div>

      <div className={styles.days}>
        {visibleDates.map((date) => (
          <Link
            href={hrefFor(date, currentDate)}
            key={date}
            data-selected={date === selectedDate}
            aria-current={date === selectedDate ? 'date' : undefined}
          >
            <span>{shortDate(date)}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
