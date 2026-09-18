import 'server-only';

import { opaqueKey } from '@/lib/actions/opaque';
import type { NotionDashboardData } from '@/types/notion';
import type { PlanningTaskCatalog } from '@/types/planning';

export function buildPlanningTaskCatalog(data: NotionDashboardData): PlanningTaskCatalog {
  const areas = data.areas.map((area) => ({
    key: opaqueKey('area', area.id),
    name: area.name,
  }));

  const areaKeyById = new Map(data.areas.map((area) => [area.id, opaqueKey('area', area.id)]));

  const projects = data.projects.map((project) => ({
    key: opaqueKey('proj', project.id),
    name: project.name,
    areaKey: project.area ? (areaKeyById.get(project.area.id) ?? null) : null,
  }));

  return {
    areas,
    projects,
    tasks: data.tasks.map((task) => ({
      key: opaqueKey('task', task.id),
      title: task.title,
      status: task.status,
      date: task.date,
      priority: task.priority,
      duration: task.duration,
      energy: task.energy,
      areaKey: task.area ? (areaKeyById.get(task.area.id) ?? null) : null,
      projectKey: task.project ? opaqueKey('proj', task.project.id) : null,
      blocker: task.blocker,
      note: task.note,
      areaName: task.area?.available ? (task.area.name ?? null) : null,
      projectName: task.project?.available ? (task.project.name ?? null) : null,
    })),
  };
}
