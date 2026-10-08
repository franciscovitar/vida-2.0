'use client';

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  addManualHabitV2Action,
  deactivateHabitV2Action,
  toggleHabitV2Action,
} from '@/app/actions/habits-v2';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { HabitV2Cadence, HabitsV2View } from '@/lib/habits/v2-contract';

import styles from './HabitsV2Board.module.scss';

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function statusLabel(state: string): string {
  if (state === 'done') return 'Hecho';
  if (state === 'missed') return 'No hecho';
  if (state === 'pending') return 'Pendiente';
  return 'No disponible';
}

export function HabitsV2Board({ view }: { view: HabitsV2View }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [cadence, setCadence] = useState<HabitV2Cadence>('daily');
  const [target, setTarget] = useState(1);
  const [unit, setUnit] = useState('vez');

  const navigate = (date: string) => {
    router.push(`/habitos?date=${date}`);
  };

  const toggle = (habitId: string, current: boolean | null) => {
    if (current === null || !view.writable) return;
    setMessage(null);
    startTransition(async () => {
      const result = await toggleHabitV2Action({
        targetDate: view.targetDate,
        habitId,
        nextValue: !current,
        expectedPreviousValue: current,
        operationId: crypto.randomUUID(),
      });
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  };

  const addHabit = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await addManualHabitV2Action({
        name,
        icon: icon.trim() || null,
        cadence,
        target,
        unit,
        operationId: crypto.randomUUID(),
      });
      setMessage(result.message);
      if (result.ok) {
        setName('');
        setIcon('');
        setCadence('daily');
        setTarget(1);
        setUnit('vez');
        setShowAdd(false);
        router.refresh();
      }
    });
  };

  const deactivate = (habitId: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await deactivateHabitV2Action({
        habitId,
        expectedActive: true,
        operationId: crypto.randomUUID(),
      });
      setMessage(result.message);
      setConfirmDeactivate(null);
      if (result.ok) router.refresh();
    });
  };

  const previous = shiftDate(view.targetDate, -1);
  const next = shiftDate(view.targetDate, 1);

  return (
    <div className={styles.stack}>
      <Card>
        <SectionHeader
          title="Día"
          description="Podés corregir días anteriores. Los hábitos automáticos se resuelven desde su fuente."
          icon={CalendarDays}
          domain="habits"
          action={
            <button
              type="button"
              className={styles['add-button']}
              onClick={() => setShowAdd((value) => !value)}
              disabled={!view.writable || pending || view.targetDate !== view.today}
            >
              <Plus size={14} aria-hidden="true" />
              Nuevo hábito
            </button>
          }
        />

        <div className={styles.navigator}>
          <button type="button" onClick={() => navigate(previous)} aria-label="Día anterior">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <input
            type="date"
            value={view.targetDate}
            max={view.today}
            onChange={(event) => navigate(event.target.value || view.today)}
            aria-label="Fecha de hábitos"
          />
          <button
            type="button"
            onClick={() => navigate(next)}
            disabled={view.targetDate >= view.today}
            aria-label="Día siguiente"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        {view.notice ? <p className={styles.notice}>{view.notice}</p> : null}
        {!view.writable ? (
          <p className={styles.notice}>
            La vista V2 está en modo lectura: su compuerta de escritura sigue desactivada.
          </p>
        ) : null}
        {message ? (
          <p className={styles.notice} role="status">
            {message}
          </p>
        ) : null}

        {showAdd ? (
          <div className={styles['add-form']}>
            <label>
              <span>Nombre</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />
            </label>
            <label>
              <span>Icono</span>
              <input value={icon} onChange={(event) => setIcon(event.target.value)} maxLength={8} />
            </label>
            <label>
              <span>Cadencia</span>
              <select
                value={cadence}
                onChange={(event) => setCadence(event.target.value as HabitV2Cadence)}
              >
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
              </select>
            </label>
            <label>
              <span>Objetivo</span>
              <input
                type="number"
                min={1}
                max={31}
                value={target}
                onChange={(event) => setTarget(Number(event.target.value) || 1)}
              />
            </label>
            <label>
              <span>Unidad</span>
              <input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                maxLength={30}
              />
            </label>
            <div className={styles['form-actions']}>
              <button type="button" onClick={() => setShowAdd(false)}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={addHabit}
                disabled={pending || name.trim().length < 2 || !view.writable}
              >
                Crear
              </button>
            </div>
          </div>
        ) : null}

        {view.items.length === 0 ? (
          <p className={styles.empty}>
            {view.status === 'unavailable'
              ? 'Los stores V2 todavía no están disponibles.'
              : 'No hay hábitos activos para esta fecha.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {view.items.map((habit) => {
              const unavailable = habit.state === 'unavailable';
              const automatic = habit.automatic;
              return (
                <li key={habit.habitId} className={styles.item} data-state={habit.state}>
                  <div className={styles.check}>
                    {automatic ? (
                      <span className={styles['auto-icon']} aria-label="Automático">
                        <Sparkles size={15} aria-hidden="true" />
                      </span>
                    ) : (
                      <Checkbox
                        checked={habit.value === true}
                        disabled={pending || unavailable || !view.writable}
                        onChange={() => toggle(habit.habitId, habit.value)}
                        label={`Marcar ${habit.name}`}
                      />
                    )}
                  </div>

                  <div className={styles.main}>
                    <div className={styles['title-row']}>
                      <strong>
                        {habit.icon ? <span aria-hidden="true">{habit.icon} </span> : null}
                        {habit.name}
                      </strong>
                      <span className={styles.state}>{statusLabel(habit.state)}</span>
                    </div>
                    <div className={styles.meta}>
                      <span>{automatic ? 'Automático' : 'Manual'}</span>
                      <span>
                        {habit.cadence === 'weekly'
                          ? `Meta ${habit.target} ${habit.unit}/semana`
                          : `Meta ${habit.target} ${habit.unit}/día`}
                      </span>
                      {habit.weeklyCompleted !== null ? (
                        <span>
                          Semana {habit.weeklyCompleted}/{habit.target}
                          {habit.weeklyCoverageComplete ? '' : ' · cobertura parcial'}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {habit.active && view.targetDate === view.today ? (
                    <div className={styles.remove}>
                      {confirmDeactivate === habit.habitId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => deactivate(habit.habitId)}
                            disabled={pending || !view.writable}
                          >
                            <Check size={13} aria-hidden="true" />
                            Confirmar
                          </button>
                          <button type="button" onClick={() => setConfirmDeactivate(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeactivate(habit.habitId)}
                          disabled={pending || !view.writable}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          Desactivar
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card compact>
        <p className={styles.footnote}>
          Desactivar conserva el historial. Un hábito derivado como Gimnasio se marca desde la
          sesión real y no admite override manual.
        </p>
      </Card>
    </div>
  );
}
