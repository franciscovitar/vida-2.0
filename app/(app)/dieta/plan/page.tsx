import { BookOpenText, BrainCircuit } from 'lucide-react';
import type { Metadata } from 'next';

import pageStyles from '@/app/(app)/page.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { NutritionNavigation } from '@/components/nutrition/NutritionNavigation';
import { NutritionPlanSection } from '@/components/nutrition/NutritionPlanSection';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
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
      <Card aria-labelledby="nutrition-evidence-title">
        <SectionHeader
          id="nutrition-evidence-title"
          title="Cómo razona tu asesor nutricional IA"
          description="Criterio de Nutrition Intelligence para recomendaciones de salud y longevidad."
          icon={BrainCircuit}
          domain="health"
        />
        <p>
          No sigue una dieta de un influencer ni califica alimentos por un pico de glucosa
          aislado. Combina perspectivas científicas y explica cuándo una idea es prometedora
          pero todavía no está demostrada en personas.
        </p>
        <ul>
          <li>
            <strong>Salud a largo plazo:</strong> estudios humanos sobre envejecimiento saludable,
            riesgo cardiovascular y calidad del patrón alimentario.
          </li>
          <li>
            <strong>Metabolismo:</strong> glucosa, fibra, grasas y procesamiento, considerando
            cantidad, preparación y el plato completo.
          </li>
          <li>
            <strong>Fuerza y rendimiento:</strong> suficiente energía y proteína para conservar
            músculo, entrenar y recuperarte.
          </li>
          <li>
            <strong>Gerociencia:</strong> autofagia, mTOR, AMPK y otras hipótesis, sin confundir
            mecanismos o biomarcadores con más años de vida demostrados.
          </li>
          <li>
            <strong>Tu realidad:</strong> historial disponible, objetivos vigentes, gustos,
            tiempo de preparación, presupuesto y adherencia.
          </li>
        </ul>
        <p>
          Las recomendaciones distinguen evidencia clínica, asociaciones y mecanismos,
          muestran incertidumbre y priorizan cambios prácticos. Nutrition Intelligence
          produce las interpretaciones; Vida solo presenta los análisis guardados y vigentes.
          Esta sección describe el método: no genera un diagnóstico ni modifica tu plan.
        </p>
        <p>
          Fuentes de referencia:{' '}
          <a
            href="https://www.nature.com/articles/s41591-025-03570-5"
            target="_blank"
            rel="noopener noreferrer"
          >
            patrones alimentarios y envejecimiento saludable (2025)
          </a>
          {' · '}
          <a
            href="https://pubmed.ncbi.nlm.nih.gov/41914202/"
            target="_blank"
            rel="noopener noreferrer"
          >
            prevención cardiovascular (2026)
          </a>
          .
        </p>
      </Card>
    </div>
  );
}
