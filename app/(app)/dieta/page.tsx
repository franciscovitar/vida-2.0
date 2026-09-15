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
import type { NutritionDashboardData } from '@/lib/nutrition/types';

export const metadata: Metadata = { title: 'Nutrición' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function pointEstimate(
  amount: number | null,
  low: number | null,
  high: number | null,
): number | null {
  if (amount !== null && Number.isFinite(amount)) return amount;
  if (low !== null && high !== null) return (low + high) / 2;
  return low ?? high;
}

function parseSelectedDate(value: string | string[] | undefined, currentDate: string): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return currentDate;
  return candidate <= currentDate ? candidate : currentDate;
}

function preferPointEstimates(data: NutritionDashboardData): NutritionDashboardData {
  return {
    ...data,
    todayEnergy: {
      ...data.todayEnergy,
      amount: pointEstimate(data.todayEnergy.amount, data.todayEnergy.low, data.todayEnergy.high),
    },
    history: data.history.map((point) => ({
      ...point,
      energyKcal: pointEstimate(point.energyKcal, point.energyKcalLow, point.energyKcalHigh),
    })),
    meals: data.meals.map((meal) => ({
      ...meal,
      energyKcal: pointEstimate(meal.energyKcal, meal.energyKcalLow, meal.energyKcalHigh),
    })),
  };
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
  const data = preferPointEstimates({
    ...rawData,
    macros: approximateMacros.length > 0 ? approximateMacros : rawData.macros,
  });

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
