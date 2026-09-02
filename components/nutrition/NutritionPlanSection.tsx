import { BookOpenText } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ContentPageView } from '@/components/web-catalog/ContentPageView';
import { isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { resolveWebCatalogPageByStableKey } from '@/lib/web-catalog/service';
import { WEB_CATALOG_FIXED_ROUTES } from '@/lib/web-catalog/section-labels';

export async function NutritionPlanSection() {
  if (!isWebCatalogEnabled()) {
    return (
      <Card aria-labelledby="nutrition-plan-title">
        <SectionHeader
          id="nutrition-plan-title"
          title="Plan, meal prep y criterios"
          description="Notion sigue siendo la fuente canónica del plan de alimentación."
          icon={BookOpenText}
          domain="health"
        />
        <p>El Registro Web está desactivado; el dashboard cuantitativo puede funcionar de forma independiente.</p>
      </Card>
    );
  }

  const result = await resolveWebCatalogPageByStableKey(WEB_CATALOG_FIXED_ROUTES.dieta.stableKey);
  if (!result.ok) {
    return (
      <Card aria-labelledby="nutrition-plan-title">
        <SectionHeader
          id="nutrition-plan-title"
          title="Plan, meal prep y criterios"
          description="No se pudo cargar el documento canónico de Notion."
          icon={BookOpenText}
          domain="health"
        />
        <p>{result.message}</p>
      </Card>
    );
  }

  if (result.kind !== 'document') {
    return (
      <Card aria-labelledby="nutrition-plan-title">
        <SectionHeader
          id="nutrition-plan-title"
          title="Plan, meal prep y criterios"
          description="El documento canónico no está disponible con un renderer compatible."
          icon={BookOpenText}
          domain="health"
        />
      </Card>
    );
  }

  return (
    <Card aria-labelledby="nutrition-plan-title">
      <SectionHeader
        id="nutrition-plan-title"
        title="Plan, meal prep y criterios"
        description="Contenido operativo desde Notion; no representa lo que efectivamente comiste."
        icon={BookOpenText}
        domain="health"
      />
      <ContentPageView page={result.page} presentation="diet" />
    </Card>
  );
}
