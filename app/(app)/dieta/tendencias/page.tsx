import { LineChart } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { MonthlyReviewCard } from '@/components/domain/MonthlyReviewCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { NutritionNavigation } from '@/components/nutrition/NutritionNavigation';
import { NutritionV2Overview } from '@/components/nutrition/NutritionV2Overview';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadNutritionDashboardData } from '@/lib/nutrition/dashboard';

export const metadata: Metadata = { title: 'Tendencias · Nutrición' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function NutritionTrendsPage() {
  await requireAuthorizedSession();
  const data = await loadNutritionDashboardData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Tendencias"
        description="Patrones de varios días, calidad del registro y señales que no conviene juzgar por una sola comida."
        icon={LineChart}
        domain="health"
      />
      <NutritionNavigation current="trends" />
      <NutritionV2Overview data={data} mode="trends" />
      <MonthlyReviewCard domain="nutrition" />
    </div>
  );
}
