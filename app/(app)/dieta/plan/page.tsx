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

const EVIDENCE_LENSES = [
  {
    title: 'Salud a largo plazo',
    description: 'Estudios humanos sobre envejecimiento saludable y prevención.',
  },
  {
    title: 'Metabolismo',
    description: 'Glucosa, fibra, grasas y el contexto del plato completo.',
  },
  {
    title: 'Fuerza y rendimiento',
    description: 'Energía, proteínas, masa muscular y recuperación.',
  },
  {
    title: 'Gerociencia',
    description: 'Autofagia, mTOR y AMPK como hipótesis, no promesas de más años de vida.',
  },
  {
    title: 'Tu realidad',
    description: 'Objetivos, preferencias, preparación, presupuesto y adherencia.',
  },
] as const;

const EVIDENCE_INTRO =
  'El asesor nutricional contrasta distintas perspectivas en lugar de seguir a un influencer o usar un único marcador, como un pico de glucosa.';
const EVIDENCE_NOTE =
  'Prioriza resultados humanos y cambios prácticos; diferencia evidencia clínica, asociaciones y mecanismos. Nutrition Intelligence interpreta tus datos y Vida solo muestra análisis guardados y vigentes. Este criterio no cambia tu plan ni diagnostica enfermedades.';

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
        <p>{EVIDENCE_INTRO}</p>
        <ul>
          {EVIDENCE_LENSES.map((lens) => (
            <li key={lens.title}>
              <strong>{lens.title}:</strong> {lens.description}
            </li>
          ))}
        </ul>
        <p>{EVIDENCE_NOTE}</p>
        <p>Fuentes científicas de referencia:</p>
        <ul>
          <li>
            <a href="https://www.nature.com/articles/s41591-025-03570-5">
              Envejecimiento saludable (2025)
            </a>
          </li>
          <li>
            <a href="https://pubmed.ncbi.nlm.nih.gov/41914202/">
              Prevención cardiovascular (2026)
            </a>
          </li>
        </ul>
      </Card>
    </div>
  );
}
