import { Boxes } from 'lucide-react';
import type { Metadata } from 'next';

import styles from '@/components/domain/DomainPage.module.scss';
import { AreasSection } from '@/components/notion/AreasSection';
import { NotionIntegrationNotice } from '@/components/notion/NotionIntegrationNotice';
import { ProjectsBoard } from '@/components/notion/ProjectsBoard';
import boardStyles from '@/components/notion/NotionBoards.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getNotionDashboard } from '@/lib/data/notion-source';
import { formatArgentineFullDate } from '@/lib/adapters/dates';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Proyectos' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sourceLabel(source: 'mock' | 'notion', status: string): string {
  if (source === 'mock' || status === 'mock') return 'Mock';
  if (status === 'ready') return 'Notion';
  return 'Notion (fallback mock)';
}

export default async function ProyectosPage() {
  const data = await getNotionDashboard();
  const s = data.projectSummary;

  return (
    <div className={`${pageStyles.page} ${local.page}`}>
      <PageHeader
        title="Proyectos"
        description={`${sourceLabel(data.source, data.status)} · ${s.total} proyectos · ${data.targetDate}`}
        icon={Boxes}
        domain="projects"
      />

      {data.notice ? <NotionIntegrationNotice status={data.status} message={data.notice} /> : null}

      <p className={styles['meta-line']}>
        <span>Fuente: {sourceLabel(data.source, data.status)}</span>
        <span>{s.total} proyectos</span>
        <span>
          Sync: {new Date(data.syncedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
        </span>
        <span>Hoy AR: {formatArgentineFullDate(data.targetDate)}</span>
      </p>

      <Card aria-labelledby="projects-summary-title">
        <SectionHeader
          id="projects-summary-title"
          title="Resumen"
          description="Solo lectura. Sin edición desde la web."
          domain="projects"
        />
        <ul className={boardStyles.summary}>
          <li>
            <strong className="tabular">{s.active}</strong>
            <span>Activos</span>
          </li>
          <li>
            <strong className="tabular">{s.waiting}</strong>
            <span>En espera</span>
          </li>
          <li>
            <strong className="tabular">{s.blocked}</strong>
            <span>Bloqueados</span>
          </li>
          <li>
            <strong className="tabular">{s.completed}</strong>
            <span>Completados</span>
          </li>
          <li>
            <strong className="tabular">{s.cancelled}</strong>
            <span>Cancelados</span>
          </li>
          <li>
            <strong className="tabular">{s.overdue}</strong>
            <span>Vencidos</span>
          </li>
          <li>
            <strong className="tabular">{s.withoutNextAction}</strong>
            <span>Sin próxima acción</span>
          </li>
        </ul>
      </Card>

      <Card aria-labelledby="projects-list-title">
        <SectionHeader
          id="projects-list-title"
          title="Proyectos"
          description="Tarjetas compactas con estado, área y próxima acción."
          domain="projects"
        />
        <ProjectsBoard projects={data.projects} areas={data.areas} />
      </Card>

      <Card aria-labelledby="areas-section-title">
        <SectionHeader
          id="areas-section-title"
          title="Áreas"
          description="Fuente para filtros, etiquetas y agrupación. Ruta /areas pendiente."
          domain="neutral"
        />
        <AreasSection areas={data.areas} />
      </Card>
    </div>
  );
}
