import { Microscope } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { NutritionNavigation } from '@/components/nutrition/NutritionNavigation';
import { NutritionNutrientTrends } from '@/components/nutrition/NutritionNutrientTrends';
import { NutritionRangeSelector } from '@/components/nutrition/NutritionRangeSelector';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { cordobaToday } from '@/lib/nutrition/dashboard';
import { loadNutritionNutrientWindow } from '@/lib/nutrition/nutrient-window-source';
import { normalizeNutritionWindow, nutritionWindowDays } from '@/lib/nutrition/window';

export const metadata: Metadata = { title: 'Nutrientes · Nutrición' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function NutritionNutrientsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  await requireAuthorizedSession();
  const params = await searchParams;
  const window = normalizeNutritionWindow(params.range);
  const windowDays = nutritionWindowDays(window);
  const data = await loadNutritionNutrientWindow(cordobaToday(), windowDays);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Nutrientes"
        description="Qué nutrientes muestran patrones persistentes y con qué cobertura."
        icon={Microscope}
        domain="health"
      />
      <NutritionNavigation current="nutrients" />
      <NutritionRangeSelector current={window} basePath="/dieta/nutrientes" />
      <NutritionNutrientTrends data={data} />
    </div>
  );
}
