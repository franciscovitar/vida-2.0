import { UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { NutritionDaySelector } from '@/components/nutrition/NutritionDaySelector';
import { NutritionNavigation } from '@/components/nutrition/NutritionNavigation';
import { NutritionV2Overview } from '@/components/nutrition/NutritionV2Overview';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { cordobaToday, loadNutritionDashboardData } from '@/lib/nutrition/dashboard';

export const metadata: Metadata = { title: 'Nutrición' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseSelectedDate(value: string | string[] | undefined, currentDate: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return currentDate;
  return candidate <= currentDate ? candidate : currentDate;
}

export default async function DietaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  await requireAuthorizedSession();

  const params = await searchParams;
  const currentDate = cordobaToday();
  const selectedDate = parseSelectedDate(params.date, currentDate);
  const selectedDateClock = new Date(`${selectedDate}T12:00:00-03:00`);
  const data = await loadNutritionDashboardData(selectedDateClock);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Nutrición"
        description="Estado del día, registro real y señales que merecen atención."
        icon={UtensilsCrossed}
        domain="health"
      />
      <NutritionNavigation current="today" />
      <NutritionDaySelector
        dates={data.history.map((point) => point.date)}
        selectedDate={selectedDate}
        currentDate={currentDate}
      />
      <NutritionV2Overview data={data} mode="today" />
    </div>
  );
}
