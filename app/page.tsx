import { DailySummary } from '@/components/dashboard/DailySummary';
import { DayHeader } from '@/components/dashboard/DayHeader';
import { FocusCard } from '@/components/dashboard/FocusCard';
import { HabitsToday } from '@/components/dashboard/HabitsToday';
import { HealthSleep } from '@/components/dashboard/HealthSleep';
import { HoyNotionPanel } from '@/components/dashboard/HoyNotion';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import { ProductivityToday } from '@/components/dashboard/ProductivityToday';
import { QuickInbox } from '@/components/dashboard/QuickInbox';
import { TodayAgenda } from '@/components/dashboard/TodayAgenda';
import { WeeklyProgress } from '@/components/dashboard/WeeklyProgress';
import { getTodayData } from '@/lib/data/source';

import styles from './page.module.scss';

/** La vista Hoy se renderiza por request para leer datos frescos. */
export const dynamic = 'force-dynamic';
/** googleapis / Notion requieren APIs de Node.js; no ejecutar en Edge. */
export const runtime = 'nodejs';

export default async function TodayPage() {
  const today = await getTodayData();

  return (
    <div className={styles.page}>
      <DayHeader header={today.header} />

      {today.notice ? <IntegrationNotice status={today.status} message={today.notice} /> : null}

      <div className={styles.top}>
        <FocusCard />
        <DailySummary summary={today.summary} />
      </div>

      <div className={styles.columns}>
        <div className={styles.main}>
          <HoyNotionPanel notion={today.notion} sources={today.sources} />
          <TodayAgenda />
          <HabitsToday
            habits={today.habits}
            weekly={today.weekly}
            targetDate={today.targetDate}
            writable={today.writable}
            rowExists={today.rowExists}
          />
          <ProductivityToday productivity={today.productivity} />
        </div>
        <div className={styles.side}>
          <HealthSleep health={today.health} />
          <WeeklyProgress goals={today.weekly} />
          <QuickInbox />
        </div>
      </div>
    </div>
  );
}
