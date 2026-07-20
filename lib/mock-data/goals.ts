import type { WeeklyGoal } from '@/types';

/** Metas semanales simuladas con progreso actual frente al objetivo. */
export const weeklyGoals: WeeklyGoal[] = [
  { id: 'goal-gym', name: 'Gimnasio', domain: 'habits', target: 3, current: 2, unit: 'veces' },
  { id: 'goal-cardio', name: 'Cardio', domain: 'health', target: 3, current: 1, unit: 'veces' },
  {
    id: 'goal-stretch',
    name: 'Estiramiento',
    domain: 'health',
    target: 3,
    current: 3,
    unit: 'veces',
  },
  { id: 'goal-mealprep', name: 'Meal prep', domain: 'habits', target: 1, current: 0, unit: 'vez' },
  { id: 'goal-football', name: 'Fútbol', domain: 'habits', target: 2, current: 1, unit: 'veces' },
];
