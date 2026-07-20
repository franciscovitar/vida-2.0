import { HabitsBoard } from '@/components/habits/HabitsBoard';
import type { HabitView, WeeklyGoal } from '@/types';

/** Sección Hábitos de la pantalla Hoy (comparte lógica con /habitos). */
export function HabitsToday({
  habits,
  weekly,
  targetDate,
  writable,
  rowExists,
}: {
  habits: HabitView[];
  weekly: WeeklyGoal[];
  targetDate: string;
  writable: boolean;
  rowExists: boolean;
}) {
  return (
    <HabitsBoard
      habits={habits}
      weekly={weekly}
      targetDate={targetDate}
      writable={writable}
      rowExists={rowExists}
    />
  );
}
