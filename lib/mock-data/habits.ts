import type { Habit } from '@/types';

/** Cinco hábitos diarios de Vida 2.0 con datos simulados. */
export const habits: Habit[] = [
  {
    id: 'habit-water',
    name: 'Tomar 2 L de agua',
    icon: '💧',
    status: 'done',
    streak: 12,
    target: 1,
    completed: 1,
  },
  {
    id: 'habit-read',
    name: 'Leer 20 min',
    icon: '📖',
    status: 'done',
    streak: 8,
    target: 1,
    completed: 1,
  },
  {
    id: 'habit-move',
    name: 'Moverme 30 min',
    icon: '🏃',
    status: 'pending',
    streak: 3,
    target: 1,
    completed: 0,
  },
  {
    id: 'habit-focus',
    name: 'Bloque de foco profundo',
    icon: '🎯',
    status: 'pending',
    streak: 5,
    target: 2,
    completed: 1,
  },
  {
    id: 'habit-sleep',
    name: 'Acostarme antes de las 00:30',
    icon: '🌙',
    status: 'unavailable',
    streak: 4,
    target: 1,
    completed: 0,
  },
];
