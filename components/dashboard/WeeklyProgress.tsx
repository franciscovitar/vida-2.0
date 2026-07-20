import { Target } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { WeeklyGoal } from '@/types';

import styles from './WeeklyProgress.module.scss';

export function WeeklyProgress({ goals }: { goals: WeeklyGoal[] }) {
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
        {goals.map((goal) => {
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
