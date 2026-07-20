'use client';

import { Target } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { WEEKLY_HABIT_DELTA_EVENT } from '@/lib/habits/events';
import type { WeeklyGoal } from '@/types';

import styles from './WeeklyProgress.module.scss';

export function WeeklyProgress({ goals }: { goals: WeeklyGoal[] }) {
  const [source, setSource] = useState(goals);
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  if (source !== goals) {
    setSource(goals);
    setDeltas({});
  }

  useEffect(() => {
    const onDelta = (event: Event) => {
      const detail = (event as CustomEvent<{ weeklyGoalId: string; delta: number }>).detail;
      if (!detail?.weeklyGoalId || !detail.delta) return;
      setDeltas((prev) => ({
        ...prev,
        [detail.weeklyGoalId]: (prev[detail.weeklyGoalId] ?? 0) + detail.delta,
      }));
    };
    window.addEventListener(WEEKLY_HABIT_DELTA_EVENT, onDelta);
    return () => window.removeEventListener(WEEKLY_HABIT_DELTA_EVENT, onDelta);
  }, []);

  const items = goals.map((goal) => ({
    ...goal,
    current: Math.max(0, goal.current + (deltas[goal.id] ?? 0)),
  }));

  return (
    <Card aria-labelledby="weekly-title">
      <SectionHeader
        id="weekly-title"
        title="Progreso semanal"
        description="Objetivos de la semana."
        icon={Target}
        domain="habits"
      />
      <ul className={styles.list}>
        {items.map((goal) => {
          const complete = goal.current >= goal.target;
          return (
            <li key={goal.id} className={styles.item}>
              <div className={styles.row}>
                <span className={styles.name}>
                  {goal.name}
                  {complete ? (
                    <span className={styles.check} aria-label="Completado">
                      {' '}
                      ✓
                    </span>
                  ) : null}
                </span>
                <span className={`${styles.count} tabular`}>
                  {goal.current}/{goal.target} {goal.unit}
                </span>
              </div>
              <ProgressBar
                value={goal.current}
                max={goal.target}
                domain={goal.domain}
                size="sm"
                label={`${goal.name}: ${goal.current} de ${goal.target} ${goal.unit}`}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
