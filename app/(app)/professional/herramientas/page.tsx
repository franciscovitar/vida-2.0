import { Workflow } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { ProfessionalNavigation } from '@/components/professional/ProfessionalNavigation';
import { ProfessionalTools } from '@/components/professional/ProfessionalTools';
import { getProfessionalToolsPageData } from '@/lib/data/professional-intelligence-source';

import pageStyles from '../../page.module.scss';

export const metadata: Metadata = { title: 'Herramientas · Profesional' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ProfessionalToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; task?: string; group?: string; all?: string }>;
}) {
  const [{ filter, task, group, all }, offers] = await Promise.all([
    searchParams,
    getProfessionalToolsPageData(),
  ]);

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Herramientas"
        description="IA por tarea, plan y presupuesto. Calidad y costo por resultado sólo con pruebas comparables."
        icon={Workflow}
        domain="projects"
      />
      <ProfessionalNavigation current="herramientas" />
      <ProfessionalTools
        data={offers}
        filter={filter}
        taskId={task}
        groupId={group}
        showAll={all === '1'}
      />
    </div>
  );
}
