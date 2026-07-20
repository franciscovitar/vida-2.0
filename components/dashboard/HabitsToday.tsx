'use client';

import { CalendarCheck, Flame } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { HabitStatus, HabitView } from '@/types';

import styles from './HabitsToday.module.scss';

export function HabitsToday({ habits }: { habits: HabitView[] }) {
  const [statuses, setStatuses] = useState<Record<string, HabitStatus>>(() =>
    Object.fromEntries(habits.map((habit) => [habit.id, habit.status])),
  );

  const doneCount = useMemo(
    () => Object.values(statuses).filter((status) => status === 'done').length,
    [statuses],
  );

  const toggle = (id: string, current: HabitStatus) => {
    if (current === 'unavailable') return;
    setStatuses((prev) => ({ ...prev, [id]: current === 'done' ? 'pending' : 'done' }));
  };

  return (
    <Card aria-labelledby="habits-title">
      <SectionHeader
        id="habits-title"
        title="Hábitos"
        description={`${doneCount} de ${habits.length} completados`}
        icon={CalendarCheck}
        domain="habits"
      />
      <ul className={styles.list}>
        {habits.map((habit) => {
          const status = statuses[habit.id];
          const unavailable = status === 'unavailable';
          return (
            <li key={habit.id} className={styles.item} data-status={status}>
              <Checkbox
                checked={status === 'done'}
                disabled={unavailable}
                onChange={() => toggle(habit.id, status)}
                label={`Marcar hábito "${habit.name}"`}
              />
              <span className={styles.name}>
                {habit.icon ? <span aria-hidden="true">{habit.icon}</span> : null}
                {habit.name}
              </span>
              {unavailable ? (
                <span className={styles.unavailable}>No disponible</span>
              ) : (
                <span className={styles.streak}>
                  <Flame size={13} strokeWidth={2} aria-hidden="true" />
                  <span className="tabular">{habit.streak}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
