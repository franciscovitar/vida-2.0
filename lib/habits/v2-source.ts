import 'server-only';

import { cache } from 'react';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { getGoogleConfig } from '@/lib/data/config';
import { loadGymSessionsSnapshot, type GymSessionsSnapshot } from '@/lib/gym/sheets-sessions-port';
import { REGISTRO_DIARIO_TAB } from '@/lib/google/constants';
import { readTabValues } from '@/lib/google/sheets-read';
import { isHabitsV2WritesEnabled } from '@/lib/habits/v2-config';
import {
  HABIT_LOG_V2_TAB,
  HABIT_REGISTRY_TAB,
  dayStateFromValue,
  deriveGymHabitValue,
  habitAppliesOnDate,
  parseHabitLogV2Table,
  parseHabitRegistryTable,
  resolveManualHabitValue,
  validYmd,
  weekDatesThrough,
  type HabitLogV2Record,
  type HabitRegistryRecord,
  type HabitV2DayState,
  type HabitV2Item,
  type HabitV2ValueOrigin,
  type HabitsV2View,
} from '@/lib/habits/v2-contract';

function boundedTargetDate(requested: string | null | undefined, today: string): string {
  if (!requested || !validYmd(requested)) return today;
  return requested > today ? today : requested;
}

function buildItem(input: {
  habit: HabitRegistryRecord;
  date: string;
  today: string;
  logRows: readonly HabitLogV2Record[];
  legacyValues: readonly (readonly (string | number | boolean | null)[])[] | null;
  gym: GymSessionsSnapshot;
}): HabitV2Item {
  const { habit, date, today } = input;

  let state: HabitV2DayState;
  let value: boolean | null;
  let origin: HabitV2ValueOrigin;

  if (habit.mode === 'derived') {
    if (habit.derivedSource !== 'gym-session') {
      state = 'unavailable';
      value = null;
      origin = 'unavailable';
    } else {
      const derived = deriveGymHabitValue(input.gym, date, today);
      state = derived.state;
      value = derived.value;
      origin = derived.origin;
    }
  } else {
    const manual = resolveManualHabitValue({
      habit,
      date,
      today,
      logRows: input.logRows,
      legacyValues: input.legacyValues,
    });
    value = manual.ok ? manual.value : null;
    origin = manual.ok ? manual.origin : 'unavailable';
    state = dayStateFromValue(value, date, today);
  }

  let weeklyCompleted: number | null = null;
  let weeklyCoverageComplete = true;

  if (habit.cadence === 'weekly') {
    weeklyCompleted = 0;
    for (const weekDate of weekDatesThrough(date)) {
      if (!habitAppliesOnDate(habit, weekDate)) continue;
      if (habit.mode === 'derived') {
        const derived =
          habit.derivedSource === 'gym-session'
            ? deriveGymHabitValue(input.gym, weekDate, today)
            : { state: 'unavailable' as const, value: null, origin: 'unavailable' as const };
        if (derived.value === true) weeklyCompleted += 1;
        if (derived.value === null) weeklyCoverageComplete = false;
      } else {
        const manual = resolveManualHabitValue({
          habit,
          date: weekDate,
          today,
          logRows: input.logRows,
          legacyValues: input.legacyValues,
        });
        if (!manual.ok || manual.value === null) weeklyCoverageComplete = false;
        if (manual.value === true) weeklyCompleted += 1;
      }
    }
  }

  return {
    habitId: habit.habitId,
    name: habit.name,
    icon: habit.icon,
    mode: habit.mode,
    cadence: habit.cadence,
    target: habit.target,
    unit: habit.unit,
    state,
    value,
    origin,
    automatic: habit.mode === 'derived',
    active: habit.active,
    weeklyCompleted,
    weeklyCoverageComplete,
  };
}

async function loadHabitsV2View(targetDateInput?: string | null): Promise<HabitsV2View> {
  const today = todayInBuenosAires();
  const targetDate = boundedTargetDate(targetDateInput, today);

  const [registryRead, logRead, legacyRead, gym] = await Promise.all([
    readTabValues(HABIT_REGISTRY_TAB),
    readTabValues(HABIT_LOG_V2_TAB),
    readTabValues(REGISTRO_DIARIO_TAB),
    loadGymSessionsSnapshot(),
  ]);

  if (!registryRead.ok || !logRead.ok) {
    return {
      status: 'unavailable',
      notice:
        'Hábitos V2 todavía no tiene disponibles sus stores normalizados. Se mantiene V1 como fallback mientras el flag esté apagado.',
      targetDate,
      today,
      writable: false,
      items: [],
    };
  }

  const registry = parseHabitRegistryTable(registryRead.values);
  const log = parseHabitLogV2Table(logRead.values);
  if (!registry.ok || !log.ok) {
    return {
      status: 'error',
      notice: !registry.ok ? registry.reason : !log.ok ? log.reason : 'Esquema V2 inválido.',
      targetDate,
      today,
      writable: false,
      items: [],
    };
  }

  const legacyValues = legacyRead.ok ? legacyRead.values : null;
  const visible = registry.rows
    .filter((habit) => habitAppliesOnDate(habit, targetDate))
    .map((habit) =>
      buildItem({
        habit,
        date: targetDate,
        today,
        logRows: log.rows,
        legacyValues,
        gym,
      }),
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));

  const degraded =
    !legacyRead.ok ||
    visible.some((item) => item.state === 'unavailable') ||
    gym.state === 'unavailable' ||
    gym.state === 'error';

  const google = getGoogleConfig();
  const writable = isHabitsV2WritesEnabled() && google.ok && google.config.writesAllowed;

  return {
    status: visible.length === 0 ? 'empty' : 'ready',
    notice: degraded
      ? 'Algunas fuentes no pudieron verificarse; los hábitos afectados se muestran como no disponibles.'
      : null,
    targetDate,
    today,
    writable,
    items: visible,
  };
}

export const getHabitsV2View = cache(loadHabitsV2View);
