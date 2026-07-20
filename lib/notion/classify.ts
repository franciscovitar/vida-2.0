/**
 * Clasificación de fechas (hoy Argentina) para tareas y proyectos.
 */
import type { NotionDateKind, NotionProjectStatus, NotionTaskStatus } from '@/types/notion';

/** Clasifica una fecha civil respecto de `today`. */
export function classifyDateKind(date: string | null, today: string): NotionDateKind {
  if (!date) return 'none';
  if (date === today) return 'today';
  if (date < today) return 'overdue';
  return 'future';
}

/**
 * Una tarea hecha no aparece vencida.
 * Sin fecha no aparece vencida.
 */
export function taskDateKind(
  status: NotionTaskStatus,
  date: string | null,
  today: string,
): NotionDateKind {
  if (status === 'Hecha') {
    if (!date) return 'none';
    if (date === today) return 'today';
    return date < today ? 'none' : 'future';
  }
  return classifyDateKind(date, today);
}

/**
 * Proyecto completado o cancelado no aparece como vencido activo.
 */
export function projectDateKind(
  status: NotionProjectStatus,
  dueDate: string | null,
  today: string,
): NotionDateKind {
  if (status === 'Completado' || status === 'Cancelado') {
    if (!dueDate) return 'none';
    if (dueDate === today) return 'today';
    return dueDate < today ? 'none' : 'future';
  }
  return classifyDateKind(dueDate, today);
}

export function isTaskOverdue(kind: NotionDateKind, status: NotionTaskStatus): boolean {
  return kind === 'overdue' && status !== 'Hecha';
}

export function isProjectOverdueActive(kind: NotionDateKind, status: NotionProjectStatus): boolean {
  return kind === 'overdue' && status !== 'Completado' && status !== 'Cancelado';
}
