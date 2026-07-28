import { CheckSquare } from 'lucide-react';
import type { Metadata } from 'next';

import { TaskCreatePanel, TaskStatusPanel } from '@/components/actions/WritePanels';
import styles from '@/components/domain/DomainPage.module.scss';
import { PageHeader } from '@/components/layout/PageHeader';
import { NotionIntegrationNotice } from '@/components/notion/NotionIntegrationNotice';
import boardStyles from '@/components/notion/NotionBoards.module.scss';
import { TasksBoard } from '@/components/notion/TasksBoard';
import { TaskPlanningWorkspace } from '@/components/tasks/TaskPlanningWorkspace';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { formatArgentineFullDate } from '@/lib/adapters/dates';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getNotionDashboard } from '@/lib/data/notion-source';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Tareas' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sourceLabel(source: 'mock' | 'notion', status: string): string {
  if (source === 'mock' || status === 'mock') return 'Mock';
  if (status === 'ready') return 'Notion';
  return 'Notion (fallback mock)';
}

export default async function TareasPage() {
  await requireAuthorizedSession();
  const writesEnabled = isWriteActionsEnabled();
  const data = await getNotionDashboard();
  const s = data.taskSummary;

  return (
    <div className={`${pageStyles.page} ${local.page}`}>
      <PageHeader
        title="Tareas"
        description={`${sourceLabel(data.source, data.status)} · ${s.total} tareas · ${data.targetDate}`}
        icon={CheckSquare}
        domain="tasks"
      />

      {data.notice ? <NotionIntegrationNotice status={data.status} message={data.notice} /> : null}
      <TaskCreatePanel writesEnabled={writesEnabled} />
      <TaskStatusPanel writesEnabled={writesEnabled} />

      <p className={styles['meta-line']}>
        <span>Fuente: {sourceLabel(data.source, data.status)}</span>
        <span>{s.total} tareas</span>
        <span>
          Sync: {new Date(data.syncedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
        </span>
        <span>Hoy AR: {formatArgentineFullDate(data.targetDate)}</span>
        <span>Estado: {data.status}</span>
      </p>

      <Card aria-labelledby="tasks-summary-title">
        <SectionHeader
          id="tasks-summary-title"
          title="Resumen"
          description="Datos reales de Notion con planificación local sin escrituras."
          domain="tasks"
        />
        <ul className={boardStyles.summary}>
          <li>
            <strong className="tabular">{s.pending}</strong>
            <span>Pendientes</span>
          </li>
          <li>
            <strong className="tabular">{s.inProgress}</strong>
            <span>En progreso</span>
          </li>
          <li>
            <strong className="tabular">{s.blocked}</strong>
            <span>Bloqueadas</span>
          </li>
          <li>
            <strong className="tabular">{s.done}</strong>
            <span>Hechas</span>
          </li>
          <li>
            <strong className="tabular">{s.someday}</strong>
            <span>Algún día</span>
          </li>
          <li>
            <strong className="tabular">{s.overdue}</strong>
            <span>Vencidas</span>
          </li>
          <li>
            <strong className="tabular">{s.dueToday}</strong>
            <span>Para hoy</span>
          </li>
        </ul>
      </Card>

      <TaskPlanningWorkspace
        tasks={data.tasks}
        projects={data.projects}
        areas={data.areas}
        targetDate={data.targetDate}
      />

      <Card aria-labelledby="tasks-list-title">
        <SectionHeader
          id="tasks-list-title"
          title="Listado"
          description="Filtros locales sobre los datos ya cargados."
          domain="tasks"
        />
        <TasksBoard tasks={data.tasks} projects={data.projects} areas={data.areas} />
      </Card>
    </div>
  );
}
