import { UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { MonthlyReviewCard } from '@/components/domain/MonthlyReviewCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { NutritionDaySelector } from '@/components/nutrition/NutritionDaySelector';
import { NutritionPlanSection } from '@/components/nutrition/NutritionPlanSection';
import { NutritionV2Overview } from '@/components/nutrition/NutritionV2Overview';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadApproximateDayMacros } from '@/lib/nutrition/approximate-day-macros';
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
  const rawData = await loadNutritionDashboardData(selectedDateClock);
  const approximateMacros = await loadApproximateDayMacros(selectedDate, rawData.target);
  const data = {
    ...rawData,
    macros: approximateMacros.length > 0 ? approximateMacros : rawData.macros,
  };

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Nutrición"
        description="Calorías, macros, micronutrientes y análisis derivados de tu registro real."
        icon={UtensilsCrossed}
        domain="health"
      />
      <NutritionDaySelector
        dates={data.history.map((point) => point.date)}
        selectedDate={selectedDate}
        currentDate={currentDate}
      />
      <NutritionV2Overview data={data} />
      <MonthlyReviewCard domain="nutrition" />
      <NutritionPlanSection />
    </div>
  );
}
