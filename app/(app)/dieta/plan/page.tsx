import { BookOpenText } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { NutritionNavigation } from '@/components/nutrition/NutritionNavigation';
import { NutritionPlanSection } from '@/components/nutrition/NutritionPlanSection';
import { requireAuthorizedSession } from '@/lib/auth/dal';

export const metadata: Metadata = { title: 'Plan · Nutrición' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function NutritionPlanPage() {
  await requireAuthorizedSession();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Plan"
        description="Objetivo, meal prep y criterios operativos. Notion sigue siendo la fuente canónica."
        icon={BookOpenText}
        domain="health"
      />
      <NutritionNavigation current="plan" />
      <NutritionPlanSection />
    </div>
  );
}
