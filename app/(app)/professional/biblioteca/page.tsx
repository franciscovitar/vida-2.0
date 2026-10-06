import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { ProfessionalLibrary } from '@/components/professional/ProfessionalLibrary';
import { ProfessionalNavigation } from '@/components/professional/ProfessionalNavigation';
import { getProfessionalLibraryPageData } from '@/lib/data/professional-intelligence-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Biblioteca · Profesional' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ProfessionalLibraryPage() {
  const data = await getProfessionalLibraryPageData();

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Biblioteca"
        description="Explicaciones y referencias para volver cuando hagan falta, sin pendientes ni deuda de lectura."
        icon={BookOpen}
        domain="projects"
      />
      <ProfessionalNavigation current="biblioteca" />
      <ProfessionalLibrary editorial={data.editorial} technologyLibrary={data.technologyLibrary} />
    </div>
  );
}
