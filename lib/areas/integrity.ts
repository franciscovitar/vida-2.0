/**
 * Advertencias de integridad (solo lectura; no corrige Notion).
 */
import type { AreaIntegrityWarning } from '@/types/areas';
import type { NotionArea, NotionProject, NotionTask } from '@/types/notion';

export function buildAreaIntegrityWarnings(input: {
  area: NotionArea;
  projects: readonly NotionProject[];
  tasks: readonly NotionTask[];
  areaNotionId: string;
}): readonly AreaIntegrityWarning[] {
  const warnings: AreaIntegrityWarning[] = [];
  const { area, projects, tasks, areaNotionId } = input;

  if (!area.reviewDate) {
    warnings.push({
      code: 'area-without-review-date',
      message: 'El Área no tiene fecha de revisión.',
      subject: area.name,
    });
  }

  for (const project of projects) {
    if (project.status === 'Activo' && !project.nextAction) {
      warnings.push({
        code: 'project-without-next-action',
        message: 'Proyecto activo sin próxima acción.',
        subject: project.name,
      });
    }
    if (project.status === 'Bloqueado' && !project.blocker) {
      warnings.push({
        code: 'blocked-project-without-blocker',
        message: 'Proyecto bloqueado sin indicar el bloqueo.',
        subject: project.name,
      });
    }
    if (project.area && !project.area.available) {
      warnings.push({
        code: 'incomplete-relation',
        message: 'Proyecto con relación de Área incompleta.',
        subject: project.name,
      });
    }
  }

  for (const task of tasks) {
    if (task.dateKind === 'overdue' && task.status !== 'Hecha') {
      warnings.push({
        code: 'overdue-pending-task',
        message: 'Tarea vencida que sigue pendiente.',
        subject: task.title,
      });
    }
    if (task.area?.available && task.area.id !== areaNotionId) {
      warnings.push({
        code: 'task-area-mismatch',
        message: 'La tarea declara un Área distinta a la del panel.',
        subject: task.title,
      });
    }
    if (
      task.projectArea?.available &&
      task.area?.available &&
      task.projectArea.id !== task.area.id
    ) {
      warnings.push({
        code: 'task-area-mismatch',
        message: 'Área de la tarea distinta al Área del proyecto.',
        subject: task.title,
      });
    }
    if ((task.area && !task.area.available) || (task.project && !task.project.available)) {
      warnings.push({
        code: 'incomplete-relation',
        message: 'Tarea con relación incompleta.',
        subject: task.title,
      });
    }
  }

  return warnings;
}
