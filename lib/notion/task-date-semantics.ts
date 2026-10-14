import type {
  NotionDateKind,
  NotionTask,
  NotionTaskDateAttention,
  NotionTaskDateSemantics,
  NotionTaskDateState,
  NotionTaskDateType,
  NotionTaskStatus,
} from '@/types/notion';

export function deriveTaskDateSemantics(
  date: string | null,
  dateType: NotionTaskDateType | null,
): NotionTaskDateSemantics {
  if (!date) return 'none';
  if (dateType === 'Deadline') return 'deadline';
  if (dateType === 'Objetivo') return 'target';
  if (dateType === 'Revisión') return 'review';
  return 'unspecified';
}

/** Read-side projection; reuse the canonical derivation without changing V1 dateKind. */
export function taskDateViewV2(task: NotionTask) {
  const semantics = task.date
    ? (task.dateSemantics ?? deriveTaskDateSemantics(task.date, task.dateType ?? null))
    : 'none';
  const state = task.date
    ? (task.dateState ?? (task.dateKind === 'overdue' ? 'past' : task.dateKind))
    : 'none';
  const attention = deriveTaskDateAttention(task.status, semantics, state);
  return { semantics, state, attention };
}

export function isTaskDeadlineOverdueV2(task: NotionTask): boolean {
  return taskDateViewV2(task).attention === 'overdue';
}

export function isTaskDeadlineDueTodayV2(task: NotionTask): boolean {
  const view = taskDateViewV2(task);
  return (
    task.status !== 'Hecha' &&
    task.status !== 'Algún día' &&
    view.semantics === 'deadline' &&
    view.state === 'today'
  );
}

export function taskDateDisplayKindV2(task: NotionTask): NotionDateKind {
  const view = taskDateViewV2(task);
  if (view.attention === 'overdue') return 'overdue';
  return view.state === 'today' || view.state === 'future' ? view.state : 'none';
}

export function taskDateLabelV2(task: NotionTask): string {
  if (!task.date) return 'Sin fecha';
  const view = taskDateViewV2(task);
  const label = {
    none: 'Sin fecha',
    deadline: 'Deadline',
    target: 'Objetivo',
    review: 'Revisión',
    unspecified: 'Fecha sin tipo',
  }[view.semantics];
  const attention =
    view.attention === 'overdue'
      ? ' · vencida'
      : view.attention === 'review-needed'
        ? ' · revisar'
        : view.state === 'today'
          ? ' · hoy'
          : '';
  return `${task.date} · ${label}${attention}`;
}

export function deriveTaskDateState(date: string | null, today: string): NotionTaskDateState {
  if (!date) return 'none';
  if (date === today) return 'today';
  return date < today ? 'past' : 'future';
}

export function deriveTaskDateAttention(
  status: NotionTaskStatus,
  semantics: NotionTaskDateSemantics,
  state: NotionTaskDateState,
): NotionTaskDateAttention {
  if (status === 'Hecha' || status === 'Algún día' || state === 'none') return 'normal';
  if (semantics === 'unspecified') return 'ambiguous';
  if (semantics === 'deadline' && state === 'past') return 'overdue';
  if (semantics === 'target' && state === 'past') return 'review-needed';
  if (semantics === 'review' && (state === 'past' || state === 'today')) return 'review-needed';
  return 'normal';
}
