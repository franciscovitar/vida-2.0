import { UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { NutritionPlanSection } from '@/components/nutrition/NutritionPlanSection';
import { NutritionV2Overview } from '@/components/nutrition/NutritionV2Overview';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadNutritionDashboardData } from '@/lib/nutrition/dashboard';

export const metadata: Metadata = { title: 'Nutrición' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DietaPage() {
  await requireAuthorizedSession();
  const data = await loadNutritionDashboardData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Nutrición"
        description="Calorías, macros, micronutrientes y análisis derivados de tu registro real."
        icon={UtensilsCrossed}
        domain="health"
      />
      <NutritionV2Overview data={data} />
      <NutritionPlanSection />
    </div>
  );
}
