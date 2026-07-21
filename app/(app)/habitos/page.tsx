import { CalendarCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CompareHint } from '@/components/domain/CompareHint';
import styles from '@/components/domain/DomainPage.module.scss';
import { HabitMatrix } from '@/components/domain/HabitMatrix';
import { PeriodSelector } from '@/components/domain/PeriodSelector';
import { SparkBars } from '@/components/domain/SparkBars';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import { HabitsBoard } from '@/components/habits/HabitsBoard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getDomainPages } from '@/lib/data/domain-pages';
import { periodLabel, parsePeriodParam } from '@/lib/periods';
import { AUTHORIZED_HABIT_META } from '@/lib/habits/authorized';

import pageStyles from '../page.module.scss';

export const metadata: Metadata = { title: 'Hábitos' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function rateLabel(rate: number | null, completed: number, available: number): string {
  if (rate === null || available === 0) return 'Sin datos';
  return `${Math.round(rate * 100)}% · ${completed}/${available}`;
}

export default async function HabitosPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const periodDays = parsePeriodParam(params.period);
  const data = await getDomainPages(periodDays);
  const habitIds = AUTHORIZED_HABIT_META.map((item) => item.header);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Hábitos"
        description={`${periodLabel(periodDays)} · ${data.habits.availableDays} días con datos`}
        icon={CalendarCheck}
        domain="habits"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />

      {data.habits.notice ? (
        <IntegrationNotice status={data.habits.status} message={data.habits.notice} />
      ) : null}

      <p className={styles['meta-line']}>
        <span>
          Período {data.habits.periodStart} → {data.habits.periodEnd}
        </span>
        <span>{data.habits.availableDays} días reales</span>
        <span>Anterior: {data.habits.previousAvailableDays} días</span>
      </p>

      <Card aria-labelledby="habits-daily-title">
        <SectionHeader
          id="habits-daily-title"
          title="Hábitos diarios"
          description="Cumplimiento en el período seleccionado."
          domain="habits"
        />
        <ul className={styles.list}>
          {data.habits.dailyHabits.map((habit) => (
            <li key={habit.id} className={styles.item}>
              <div className={styles.name}>
                <span className={styles.title}>
                  {habit.icon ? <span aria-hidden="true">{habit.icon} </span> : null}
                  {habit.name}
                </span>
                <span className={styles.sub}>
                  Hoy:{' '}
                  {habit.todayStatus === 'done'
                    ? 'hecho'
                    : habit.todayStatus === 'pending'
                      ? 'pendiente'
                      : 'no disponible'}
                </span>
              </div>
              <SparkBars
                values={habit.series}
                label={`Historial de ${habit.name}`}
                domain="habits"
              />
              <div className={styles.right}>
                <span className={`${styles.stat} tabular`}>
                  {rateLabel(habit.rate, habit.completed, habit.available)}
                </span>
                <CompareHint compare={habit.compare} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="habits-goals-title">
        <SectionHeader
          id="habits-goals-title"
          title="Metas semanales"
          description="Objetivos 3 / 3 / 3 / 1 / 2."
          domain="habits"
        />
        <div className={styles.list}>
          {data.habits.weeklyGoals.map((goal) => (
            <div key={goal.id} className={styles['week-row']}>
              <div className={styles['week-top']}>
                <span className={styles.title}>{goal.name}</span>
                <span className={`${styles.stat} tabular`}>
                  {goal.currentWeek}/{goal.target} {goal.unit} · {goal.percent}%
                </span>
              </div>
              <ProgressBar
                value={goal.currentWeek}
                max={goal.target}
                domain={goal.domain}
                size="sm"
                label={`${goal.name}: ${goal.currentWeek} de ${goal.target}`}
              />
              <span className={styles.sub}>
                Promedio semanal:{' '}
                {goal.averagePerWeek === null
                  ? 'Sin datos'
                  : `${Math.round(goal.averagePerWeek * 10) / 10} ${goal.unit}`}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card aria-labelledby="habits-matrix-title">
        <SectionHeader
          id="habits-matrix-title"
          title="Matriz de cumplimiento"
          description="Verdadero, falso y sin datos se distinguen. Futuros no cuentan."
          domain="habits"
        />
        <HabitMatrix days={data.habits.calendar} habitIds={habitIds} />
      </Card>

      <HabitsBoard
        habits={data.habits.todayHabits}
        weekly={data.habits.todayWeekly}
        targetDate={data.habits.targetDate}
        writable={data.habits.writable}
        rowExists={data.habits.rowExists}
        title="Edición de hoy"
        description="Solo hoy · Sheet DEV"
      />
    </div>
  );
}
