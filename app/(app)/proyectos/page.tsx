import { Boxes } from 'lucide-react';
import type { Metadata } from 'next';

import { ProjectsIntelligenceDashboard } from '@/components/projects/ProjectsIntelligenceDashboard';
import { PageHeader } from '@/components/layout/PageHeader';
import { getProjectsIntelligence } from '@/lib/data/projects-intelligence-source';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Proyectos' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ProyectosPage() {
  const data = await getProjectsIntelligence();

  return (
    <div className={`${pageStyles.page} ${local.page}`}>
      <PageHeader
        title="Proyectos"
        description="Portfolio real, progreso por hitos y próximas acciones."
        icon={Boxes}
        domain="projects"
      />

      <ProjectsIntelligenceDashboard data={data} />
    </div>
  );
}
