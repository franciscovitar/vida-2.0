'use client';

import { CalendarDays, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { HabitsV2View } from '@/lib/habits/v2-contract';

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
  const navigate = (date: string) => router.push(`/habitos?date=${date}`);

  const previous = shiftDate(view.targetDate, -1);
  const next = shiftDate(view.targetDate, 1);

  return (
    <div className={styles.stack}>
      <Card>
        <SectionHeader
          title="Día"
          description="Consultá días anteriores. Los hábitos automáticos se resuelven desde su fuente."
          icon={CalendarDays}
          domain="habits"
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

        {view.notice ? (
          <p className={styles.notice} role="status">
            {view.notice}
          </p>
        ) : null}
        <p className={styles.notice}>
          La vista V2 está en modo lectura: su escritor sigue desconectado.
        </p>

        {view.items.length === 0 ? (
          <p className={styles.empty}>
            {view.status === 'unavailable'
              ? 'Los stores V2 todavía no están disponibles.'
              : view.status === 'error'
                ? 'No se pudo verificar la fuente de hábitos; su estado sigue sin confirmar.'
                : 'No hay hábitos activos para esta fecha.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {view.items.map((habit) => {
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
                        disabled
                        onChange={() => undefined}
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
                      {habit.cadence === 'weekly' ? (
                        <span>
                          {habit.weeklyCoverageComplete && habit.weeklyCompleted !== null
                            ? `Semana ${habit.weeklyCompleted}/${habit.target}`
                            : 'Semana sin confirmar · cobertura parcial'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card compact>
        <p className={styles.footnote}>
          El historial se conserva. Un hábito derivado como Gimnasio se muestra desde la sesión real
          y no admite override manual.
        </p>
      </Card>
    </div>
  );
}
