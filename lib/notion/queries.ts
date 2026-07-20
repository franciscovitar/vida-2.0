/**
 * Consultas a los tres data sources autorizados + ensamblado de DTO.
 * Una query por base; relaciones resueltas con mapas locales.
 */
import 'server-only';

import { adaptArea, adaptProject, adaptTask, buildNameMap } from '@/lib/notion/adapters';
import type { NotionReadPort } from '@/lib/notion/client';
import type { NotionConfig } from '@/lib/notion/config';
import type { NotionReadCode } from '@/lib/notion/errors';
import { summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import type { NotionDashboardData } from '@/types/notion';

export async function loadNotionDashboardFromPort(
  port: NotionReadPort,
  config: NotionConfig,
  today: string,
  syncedAt: string,
): Promise<{ ok: true; data: NotionDashboardData } | { ok: false; code: NotionReadCode }> {
  const [areasResult, projectsResult, tasksResult] = await Promise.all([
    port.queryDataSource(config.areasDataSourceId),
    port.queryDataSource(config.projectsDataSourceId),
    port.queryDataSource(config.tasksDataSourceId),
  ]);

  if (!areasResult.ok) return { ok: false, code: areasResult.code };
  if (!projectsResult.ok) return { ok: false, code: projectsResult.code };
  if (!tasksResult.ok) return { ok: false, code: tasksResult.code };

  const areas = areasResult.pages.map((page) => adaptArea(page));
  const areaNames = buildNameMap(areas);

  const projects = projectsResult.pages.map((page) => adaptProject(page, areaNames, today));
  const projectNames = buildNameMap(projects.map((p) => ({ id: p.id, name: p.name })));

  const tasks = tasksResult.pages.map((page) => adaptTask(page, projectNames, areaNames, today));

  // Si las relaciones de conteo vienen vacías desde Notion, alinear con tareas/proyectos locales.
  const projectTaskCounts = new Map<string, number>();
  for (const task of tasks) {
    if (task.project?.id) {
      projectTaskCounts.set(task.project.id, (projectTaskCounts.get(task.project.id) ?? 0) + 1);
    }
  }
  const projectsWithCounts = projects.map((project) => ({
    ...project,
    relatedTaskCount:
      project.relatedTaskCount > 0
        ? project.relatedTaskCount
        : (projectTaskCounts.get(project.id) ?? 0),
  }));

  const areaProjectCounts = new Map<string, number>();
  const areaTaskCounts = new Map<string, number>();
  for (const project of projectsWithCounts) {
    if (project.area?.id) {
      areaProjectCounts.set(project.area.id, (areaProjectCounts.get(project.area.id) ?? 0) + 1);
    }
  }
  for (const task of tasks) {
    if (task.area?.id) {
      areaTaskCounts.set(task.area.id, (areaTaskCounts.get(task.area.id) ?? 0) + 1);
    }
  }
  const areasWithCounts = areas.map((area) => ({
    ...area,
    relatedProjectCount:
      area.relatedProjectCount > 0
        ? area.relatedProjectCount
        : (areaProjectCounts.get(area.id) ?? 0),
    relatedTaskCount:
      area.relatedTaskCount > 0 ? area.relatedTaskCount : (areaTaskCounts.get(area.id) ?? 0),
  }));

  return {
    ok: true,
    data: {
      source: 'notion',
      status: tasks.length === 0 && projects.length === 0 ? 'empty' : 'ready',
      notice: null,
      syncedAt,
      targetDate: today,
      tasks,
      projects: projectsWithCounts,
      areas: areasWithCounts,
      taskSummary: summarizeTasks(tasks),
      projectSummary: summarizeProjects(projectsWithCounts),
    },
  };
}
