'use client';

import { CalendarCheck, Flame, RotateCcw } from 'lucide-react';
import { useMemo, useRef, useState, useTransition } from 'react';

import { toggleHabitAction } from '@/app/actions/habits';
import { dispatchWeeklyDelta } from '@/lib/habits/events';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { HabitStatus, HabitView, WeeklyGoal } from '@/types';

import styles from './HabitsBoard.module.scss';

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface HabitLocal {
  id: string;
  name: string;
  icon?: string;
  status: HabitStatus;
  streak: number;
  streakAvailable: boolean;
  weeklyGoalId?: string;
  value: boolean;
  save: SaveState;
  canUndo: boolean;
}

interface HabitsBoardProps {
  habits: HabitView[];
  weekly: WeeklyGoal[];
  targetDate: string;
  writable: boolean;
  rowExists: boolean;
  title?: string;
  description?: string;
}

const UNDO_MS = 5000;
const SAVED_MS = 1800;

function toLocal(habits: HabitView[]): HabitLocal[] {
  return habits.map((habit) => ({
    ...habit,
    value: habit.status === 'done',
    save: 'idle' as const,
    canUndo: false,
  }));
}

function statusFromValue(value: boolean, unavailable: boolean): HabitStatus {
  if (unavailable) return 'unavailable';
  return value ? 'done' : 'pending';
}

export function HabitsBoard({
  habits,
  weekly,
  targetDate,
  writable,
  rowExists,
  title = 'Hábitos',
  description,
}: HabitsBoardProps) {
  const [source, setSource] = useState({ habits, weekly });
  const [items, setItems] = useState<HabitLocal[]>(() => toLocal(habits));
  const [goals, setGoals] = useState<WeeklyGoal[]>(() => weekly.map((goal) => ({ ...goal })));
  const [banner, setBanner] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const undoTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingIds = useRef<Set<string>>(new Set());

  if (source.habits !== habits || source.weekly !== weekly) {
    setSource({ habits, weekly });
    setItems(toLocal(habits));
    setGoals(weekly.map((goal) => ({ ...goal })));
  }

  const doneCount = useMemo(() => items.filter((habit) => habit.status === 'done').length, [items]);

  const applyWeeklyDelta = (weeklyGoalId: string | undefined, delta: number) => {
    if (!weeklyGoalId || delta === 0) return;
    setGoals((prev) =>
      prev.map((goal) =>
        goal.id === weeklyGoalId ? { ...goal, current: Math.max(0, goal.current + delta) } : goal,
      ),
    );
    dispatchWeeklyDelta(weeklyGoalId, delta);
  };

  const setHabitPatch = (id: string, patch: Partial<HabitLocal>) => {
    setItems((prev) => prev.map((habit) => (habit.id === id ? { ...habit, ...patch } : habit)));
  };

  const runToggle = (habit: HabitLocal, nextValue: boolean, fromUndo: boolean) => {
    if (!writable || !rowExists) return;
    if (pendingIds.current.has(habit.id) || habit.save === 'saving') return;

    const previous = habit.value;
    if (previous === nextValue) return;

    pendingIds.current.add(habit.id);
    setBanner(null);
    setHabitPatch(habit.id, {
      value: nextValue,
      status: statusFromValue(nextValue, false),
      save: 'saving',
      canUndo: false,
    });
    applyWeeklyDelta(habit.weeklyGoalId, nextValue ? 1 : -1);

    const operationId = crypto.randomUUID();

    startTransition(() => {
      void (async () => {
        const result = await toggleHabitAction({
          targetDate,
          habitName: habit.id,
          nextValue,
          expectedPreviousValue: previous,
          operationId,
        });

        pendingIds.current.delete(habit.id);

        if (!result.ok) {
          applyWeeklyDelta(habit.weeklyGoalId, nextValue ? -1 : 1);
          setHabitPatch(habit.id, {
            value: previous,
            status: statusFromValue(previous, false),
            save: result.code === 'conflict' ? 'conflict' : 'error',
            canUndo: false,
          });
          setBanner(
            result.code === 'conflict'
              ? 'Los datos cambiaron en el Sheet. Actualizá la página.'
              : result.message,
          );
          return;
        }

        setHabitPatch(habit.id, {
          value: result.currentValue,
          status: statusFromValue(result.currentValue, false),
          save: 'saved',
          canUndo: !fromUndo,
        });

        if (savedTimers.current[habit.id]) clearTimeout(savedTimers.current[habit.id]);
        savedTimers.current[habit.id] = setTimeout(() => {
          setHabitPatch(habit.id, { save: 'idle' });
        }, SAVED_MS);

        if (!fromUndo) {
          if (undoTimers.current[habit.id]) clearTimeout(undoTimers.current[habit.id]);
          undoTimers.current[habit.id] = setTimeout(() => {
            setHabitPatch(habit.id, { canUndo: false });
          }, UNDO_MS);
        }
      })();
    });
  };

  const onToggle = (habit: HabitLocal) => {
    if (habit.save === 'saving' || pendingIds.current.has(habit.id)) return;
    if (!writable) {
      const next = !habit.value;
      setHabitPatch(habit.id, {
        value: next,
        status: statusFromValue(next, habit.status === 'unavailable'),
      });
      applyWeeklyDelta(habit.weeklyGoalId, next ? 1 : -1);
      return;
    }
    if (!rowExists) {
      setBanner('No hay una fila para hoy en Registro diario.');
      return;
    }
    if (habit.status === 'unavailable') return;
    runToggle(habit, !habit.value, false);
  };

  const onUndo = (habit: HabitLocal) => {
    if (!habit.canUndo || habit.save === 'saving' || pendingIds.current.has(habit.id)) return;
    runToggle(habit, !habit.value, true);
  };

  const subtitle =
    description ??
    `${doneCount} de ${items.length} completados` + (writable ? '' : ' · solo local');

  return (
    <Card aria-labelledby="habits-board-title">
      <SectionHeader
        id="habits-board-title"
        title={title}
        description={subtitle}
        icon={CalendarCheck}
        domain="habits"
      />
      {banner ? (
        <p className={styles.banner} role="status">
          {banner}
        </p>
      ) : null}
      <ul className={styles.list}>
        {items.map((habit) => {
          const unavailable = habit.status === 'unavailable';
          const busy = habit.save === 'saving';
          return (
            <li
              key={habit.id}
              className={styles.item}
              data-status={habit.status}
              data-save={habit.save}
            >
              <Checkbox
                checked={habit.value}
                disabled={unavailable || busy || (writable && !rowExists)}
                onChange={() => onToggle(habit)}
                label={`Marcar hábito "${habit.name}"`}
              />
              <span className={styles.name}>
                {habit.icon ? <span aria-hidden="true">{habit.icon}</span> : null}
                {habit.name}
              </span>
              <span className={styles.meta}>
                {busy ? <span className={styles.saving}>Guardando…</span> : null}
                {habit.save === 'saved' ? <span className={styles.saved}>Guardado</span> : null}
                {habit.canUndo && !busy ? (
                  <button
                    type="button"
                    className={styles.undo}
                    onClick={() => onUndo(habit)}
                    aria-label={`Deshacer cambio en ${habit.name}`}
                  >
                    <RotateCcw size={12} strokeWidth={2.5} aria-hidden="true" />
                    Deshacer
                  </button>
                ) : null}
                {unavailable ? (
                  <span className={styles.unavailable}>No disponible</span>
                ) : (
                  <span className={styles.streak}>
                    <Flame size={13} strokeWidth={2} aria-hidden="true" />
                    <span className="tabular">{habit.streak}</span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {writable && goals.length > 0 && title !== 'Hábitos' ? (
        <div className={styles.weekly} aria-label="Progreso semanal de hábitos">
          {goals.map((goal) => (
            <span key={goal.id} className={styles['weekly-chip']}>
              {goal.name}{' '}
              <span className="tabular">
                {goal.current}/{goal.target}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
