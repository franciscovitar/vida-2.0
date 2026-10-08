import type { NotionTaskDateType, NotionTaskStatus } from '@/types/notion';

export type TaskDateSemanticsV2 = 'none' | 'deadline' | 'target' | 'review' | 'unspecified';
export type TaskDateStateV2 = 'future' | 'today' | 'past' | 'none';
export type TaskDateAttentionV2 = 'normal' | 'overdue' | 'review-needed' | 'ambiguous';

export interface TaskDateClassificationV2 {
  semantics: TaskDateSemanticsV2;
  dateState: TaskDateStateV2;
  attention: TaskDateAttentionV2;
}

function semanticsOf(date: string | null, dateType?: NotionTaskDateType | null): TaskDateSemanticsV2 {
  if (!date) return 'none';
  if (dateType === 'Deadline') return 'deadline';
  if (dateType === 'Objetivo') return 'target';
  if (dateType === 'Revisión') return 'review';
  return 'unspecified';
}

function dateStateOf(date: string | null, today: string): TaskDateStateV2 {
  if (!date) return 'none';
  if (date === today) return 'today';
  return date < today ? 'past' : 'future';
}

export function classifyTaskDateV2(
  status: NotionTaskStatus,
  date: string | null,
  today: string,
  dateType?: NotionTaskDateType | null,
): TaskDateClassificationV2 {
  const semantics = semanticsOf(date, dateType);
  const dateState = dateStateOf(date, today);

  if (status === 'Hecha' || semantics === 'none') {
    return { semantics, dateState, attention: 'normal' };
  }

  if (semantics === 'unspecified') {
    return { semantics, dateState, attention: 'ambiguous' };
  }

  if (semantics === 'deadline' && dateState === 'past') {
    return { semantics, dateState, attention: 'overdue' };
  }

  if (semantics === 'target' && dateState === 'past') {
    return { semantics, dateState, attention: 'review-needed' };
  }

  if (semantics === 'review' && (dateState === 'past' || dateState === 'today')) {
    return { semantics, dateState, attention: 'review-needed' };
  }

  return { semantics, dateState, attention: 'normal' };
}
