/**
 * Adapter de la pestaña "Registro diario".
 *
 * Parsea filas a registros tipados (conservando 0/false/vacío) y deriva las
 * vistas de productividad, hábitos y metas semanales.
 */
import type { Domain, HabitStatus, HabitView, ProductivityView, WeeklyGoal } from '@/types';

import { formatDuration } from '../format';
import {
  RD,
  RD_HABIT_HEADERS,
  REGISTRO_DIARIO_HEADERS,
  REGISTRO_DIARIO_TAB,
} from '../google/constants';
import { buildHeaderIndex, columnIndex, requireHeaders } from '../validation/headers';
import { toBoolean, toNumber, rawCell, type Cell } from './cells';
import { isWithin, parseSheetDate, startOfWeekMonday } from './dates';
import { deltaFromMinutes, emptyDelta } from './views';

export interface RegistroRecord {
  date: string | null;
  sleepHours: Cell<number>;
  energy: Cell<number>;
  mood: Cell<number>;
  screen: Cell<number>;
  work: Cell<number>;
  faculty: Cell<number>;
  vida2: Cell<number>;
  leisure: Cell<number>;
  pcActive: Cell<number>;
  pcAway: Cell<number>;
  unclassified: Cell<number>;
  habits: Record<string, Cell<boolean>>;
}

/** Hábitos del día que muestra el dashboard. */
export const DASHBOARD_HABITS: readonly { header: string; name: string; icon: string }[] = [
  { header: RD.bed, name: 'Tender la cama', icon: '🛏️' },
  { header: RD.shower, name: 'Bañarme al levantarme', icon: '🚿' },
  { header: RD.posture, name: 'Postura 5 min', icon: '🧘' },
  { header: RD.journaling, name: 'Journaling', icon: '📓' },
  { header: RD.gym, name: 'Gimnasio', icon: '🏋️' },
];

interface WeeklyGoalDef {
  id: string;
  name: string;
  domain: Domain;
  target: number;
  unit: string;
  header: string;
}

const WEEKLY_GOALS: readonly WeeklyGoalDef[] = [
  { id: 'goal-gym', name: 'Gimnasio', domain: 'habits', target: 3, unit: 'veces', header: RD.gym },
  {
    id: 'goal-cardio',
    name: 'Cardio',
    domain: 'health',
    target: 3,
    unit: 'veces',
    header: RD.cardio,
  },
  {
    id: 'goal-stretch',
    name: 'Estiramiento',
    domain: 'health',
    target: 3,
    unit: 'veces',
    header: RD.stretch,
  },
  {
    id: 'goal-mealprep',
    name: 'Meal prep',
    domain: 'habits',
    target: 1,
    unit: 'vez',
    header: RD.mealPrep,
  },
  {
    id: 'goal-football',
    name: 'Fútbol',
    domain: 'habits',
    target: 2,
    unit: 'veces',
    header: RD.football,
  },
];

interface ProductivityDef {
  id: string;
  label: string;
  domain: Domain;
  pick: (record: RegistroRecord) => Cell<number>;
}

const PRODUCTIVITY_DEFS: readonly ProductivityDef[] = [
  { id: 'work', label: 'Trabajo', domain: 'productivity', pick: (r) => r.work },
  { id: 'university', label: 'Facultad', domain: 'learning', pick: (r) => r.faculty },
  { id: 'vida2', label: 'Vida 2.0', domain: 'habits', pick: (r) => r.vida2 },
  { id: 'leisure', label: 'Ocio', domain: 'neutral', pick: (r) => r.leisure },
];

/** Parsea las filas crudas de "Registro diario" a registros tipados. */
export function parseRegistroDiario(values: readonly unknown[][]): RegistroRecord[] {
  const header = values[0] ?? [];
  const index = buildHeaderIndex(header);
  requireHeaders(index, REGISTRO_DIARIO_HEADERS, REGISTRO_DIARIO_TAB);

  const num = (row: readonly unknown[], name: string): Cell<number> =>
    toNumber(rawCell(row, columnIndex(index, name, REGISTRO_DIARIO_TAB)));

  const records: RegistroRecord[] = [];
  for (let r = 1; r < values.length; r += 1) {
    const row = values[r] ?? [];
    const habits: Record<string, Cell<boolean>> = {};
    for (const habitHeader of RD_HABIT_HEADERS) {
      habits[habitHeader] = toBoolean(
        rawCell(row, columnIndex(index, habitHeader, REGISTRO_DIARIO_TAB)),
      );
    }
    records.push({
      date: parseSheetDate(rawCell(row, columnIndex(index, RD.fecha, REGISTRO_DIARIO_TAB))),
      sleepHours: num(row, RD.sleep),
      energy: num(row, RD.energy),
      mood: num(row, RD.mood),
      screen: num(row, RD.screen),
      work: num(row, RD.work),
      faculty: num(row, RD.faculty),
      vida2: num(row, RD.vida2),
      leisure: num(row, RD.leisure),
      pcActive: num(row, RD.pcActive),
      pcAway: num(row, RD.pcAway),
      unclassified: num(row, RD.unclassified),
      habits,
    });
  }
  return records;
}

/** true si el registro tiene al menos un dato real relevante.
 *
 * No cuenta: filas con solo false / vacíos precreados.
 * Sí cuenta: hábito true; métrica numérica presente (incluido 0);
 * energía/ánimo; ActivityWatch (pantalla, buckets, PC).
 */
export function registroHasData(record: RegistroRecord): boolean {
  const numeric: Cell<number>[] = [
    record.sleepHours,
    record.energy,
    record.mood,
    record.screen,
    record.work,
    record.faculty,
    record.vida2,
    record.leisure,
    record.pcActive,
    record.pcAway,
    record.unclassified,
  ];
  if (numeric.some((cell) => cell.kind === 'value')) return true;
  return Object.values(record.habits).some((cell) => cell.kind === 'value' && cell.value === true);
}

function habitStatus(cell: Cell<boolean> | undefined): HabitStatus {
  if (!cell || cell.kind !== 'value') return 'unavailable';
  return cell.value ? 'done' : 'pending';
}

/** Deriva los hábitos del día. `available` va de más antiguo a más reciente. */
export function buildHabitViews(
  latest: RegistroRecord | null,
  available: readonly RegistroRecord[],
): HabitView[] {
  return DASHBOARD_HABITS.map((def) => {
    const status = habitStatus(latest?.habits[def.header]);
    let streak = 0;
    for (let i = available.length - 1; i >= 0; i -= 1) {
      const cell = available[i].habits[def.header];
      if (cell && cell.kind === 'value' && cell.value === true) {
        streak += 1;
      } else {
        break;
      }
    }
    return {
      id: def.header,
      name: def.name,
      icon: def.icon,
      status,
      streak,
      streakAvailable: status !== 'unavailable',
    };
  });
}

/** Deriva las metas semanales contando hábitos en true dentro de la semana. */
export function buildWeeklyGoals(
  available: readonly RegistroRecord[],
  today: string,
): WeeklyGoal[] {
  const monday = startOfWeekMonday(today);
  const weekRecords = available.filter(
    (record) => record.date && isWithin(record.date, monday, today),
  );
  return WEEKLY_GOALS.map((def) => {
    const current = weekRecords.reduce((count, record) => {
      const cell = record.habits[def.header];
      return cell && cell.kind === 'value' && cell.value === true ? count + 1 : count;
    }, 0);
    return {
      id: def.id,
      name: def.name,
      domain: def.domain,
      target: def.target,
      current,
      unit: def.unit,
    };
  });
}

/** Deriva la vista de productividad a partir del último día y el anterior. */
export function buildProductivityView(
  latest: RegistroRecord | null,
  previous: RegistroRecord | null,
): ProductivityView {
  const rows = PRODUCTIVITY_DEFS.map((def) => {
    const current = latest ? def.pick(latest) : ({ kind: 'empty' } as Cell<number>);
    const prior = previous ? def.pick(previous) : ({ kind: 'empty' } as Cell<number>);
    const hasValue = current.kind === 'value';
    return {
      id: def.id,
      label: def.label,
      domain: def.domain,
      value: hasValue ? formatDuration(current.value) : 'Sin datos',
      fillMinutes: hasValue ? current.value : 0,
      delta:
        current.kind === 'value' && prior.kind === 'value'
          ? deltaFromMinutes(current.value, prior.value)
          : emptyDelta(),
    };
  });

  const activeCurrent = latest ? latest.pcActive : ({ kind: 'empty' } as Cell<number>);
  const activePrevious = previous ? previous.pcActive : ({ kind: 'empty' } as Cell<number>);

  return {
    active: {
      value: activeCurrent.kind === 'value' ? formatDuration(activeCurrent.value) : 'Sin datos',
      delta:
        activeCurrent.kind === 'value' && activePrevious.kind === 'value'
          ? deltaFromMinutes(activeCurrent.value, activePrevious.value)
          : emptyDelta(),
    },
    maxMinutes: Math.max(...rows.map((row) => row.fillMinutes), 1),
    rows,
  };
}
