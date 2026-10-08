import type {
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
