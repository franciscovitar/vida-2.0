/**
 * Catálogos opacos sanitizados para paneles de escritura de tareas.
 * Nunca incluye UUIDs de Notion ni stable keys hardcodeadas.
 */
import { opaqueKey } from '@/lib/actions/opaque';
import type { NotionArea, NotionProject, NotionTask, NotionTaskStatus } from '@/types/notion';

export type TaskWriteAreaOption = {
  key: string;
  name: string;
  status: string;
};

export type TaskWriteProjectOption = {
  key: string;
  name: string;
  areaKey: string;
  status: string;
};

export type TaskWriteTaskOption = {
  key: string;
  title: string;
  status: NotionTaskStatus;
  areaName: string | null;
  projectName: string | null;
};

export type TaskWriteCatalogs = {
  areas: TaskWriteAreaOption[];
  projects: TaskWriteProjectOption[];
  tasks: TaskWriteTaskOption[];
};

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

function byTitle(a: { title: string }, b: { title: string }): number {
  return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
}

export function buildTaskWriteCatalogs(input: {
  areas: readonly NotionArea[];
  projects: readonly NotionProject[];
  tasks: readonly NotionTask[];
}): TaskWriteCatalogs {
  const areas: TaskWriteAreaOption[] = input.areas
    .filter((area) => area.status === 'Activa')
    .map((area) => ({
      key: opaqueKey('area', area.id),
      name: area.name,
      status: area.status,
    }))
    .sort(byName);

  const projects: TaskWriteProjectOption[] = input.projects
    .filter(
      (project) =>
        project.status === 'Activo' &&
        project.area !== null &&
        project.area.available &&
        Boolean(project.area.id),
    )
    .map((project) => ({
      key: opaqueKey('proj', project.id),
      name: project.name,
      areaKey: opaqueKey('area', project.area!.id),
      status: project.status,
    }))
    .sort(byName);

  const tasks: TaskWriteTaskOption[] = input.tasks
    .map((task) => ({
      key: opaqueKey('task', task.id),
      title: task.title,
      status: task.status,
      areaName: task.area?.name ?? null,
      projectName: task.project?.name ?? null,
    }))
    .sort(byTitle);

  return { areas, projects, tasks };
}
