/**
 * Lista blanca de hábitos que pueden escribirse desde la web.
 * Ningún otro encabezado está permitido.
 */
import { RD, RD_HABIT_HEADERS } from '@/lib/google/constants';

/**
 * La whitelist conserva las 10 columnas históricas, incluyendo Cardio y Fútbol,
 * para no romper compatibilidad de escritura aunque ya no se muestren como hábitos diarios.
 */
export const AUTHORIZED_HABIT_NAMES: readonly string[] = RD_HABIT_HEADERS;

const AUTHORIZED_SET = new Set<string>(AUTHORIZED_HABIT_NAMES);

/** true solo si el nombre está en la lista blanca exacta. */
export function isAuthorizedHabitName(name: string): boolean {
  return AUTHORIZED_SET.has(name);
}

/** Metadatos de UI para los hábitos visibles en Habit Tracker. */
export const AUTHORIZED_HABIT_META: readonly {
  header: string;
  name: string;
  icon: string;
  weeklyGoalId?: string;
}[] = [
  { header: RD.firstAlarm, name: 'Primera alarma', icon: '⏰' },
  { header: RD.bed, name: 'Tender la cama', icon: '🛏️' },
  { header: RD.shower, name: 'Bañarme al levantarme', icon: '🚿' },
  { header: RD.posture, name: 'Postura 5 min', icon: '🧘' },
  { header: RD.gym, name: 'Gimnasio', icon: '🏋️', weeklyGoalId: 'goal-gym' },
  {
    header: RD.stretch,
    name: 'Estiramiento post-gym',
    icon: '🤸',
    weeklyGoalId: 'goal-stretch',
  },
  { header: RD.mealPrep, name: 'Comida / meal prep', icon: '🥗', weeklyGoalId: 'goal-mealprep' },
  { header: RD.journaling, name: 'Journaling', icon: '📓' },
];
