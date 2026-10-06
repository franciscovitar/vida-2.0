import { Microscope } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { NutritionNavigation } from '@/components/nutrition/NutritionNavigation';
import { NutritionV2Overview } from '@/components/nutrition/NutritionV2Overview';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadNutritionDashboardData } from '@/lib/nutrition/dashboard';

export const metadata: Metadata = { title: 'Nutrientes · Nutrición' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function NutritionNutrientsPage() {
  await requireAuthorizedSession();
  const data = await loadNutritionDashboardData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Nutrientes"
        description="Micronutrientes, referencias y cobertura con incertidumbre visible."
        icon={Microscope}
        domain="health"
      />
      <NutritionNavigation current="nutrients" />
      <NutritionV2Overview data={data} mode="nutrients" />
    </div>
  );
}
