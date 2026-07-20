/** Evento de ventana para sincronizar contadores semanales entre islas cliente. */

export const WEEKLY_HABIT_DELTA_EVENT = 'vida:habit-weekly-delta';

export function dispatchWeeklyDelta(weeklyGoalId: string, delta: number) {
  if (typeof window === 'undefined' || !weeklyGoalId || delta === 0) return;
  window.dispatchEvent(
    new CustomEvent(WEEKLY_HABIT_DELTA_EVENT, { detail: { weeklyGoalId, delta } }),
  );
}
