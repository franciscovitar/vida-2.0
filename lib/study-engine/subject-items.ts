import type { StudyItem, StudyOperation } from '@/lib/study-engine/items';

const OPERATIONS = new Set<StudyOperation>(['recall', 'explain', 'discriminate']);
const CHANNELS = new Set(['theoretical', 'practical', 'integrative']);

type JsonObject = Record<string, unknown>;

export type StudySubjectItemsRead =
  | {
      state: 'ready';
      subjectId: string;
      assessmentId: string;
      items: readonly StudyItem[];
      notice: null;
    }
  | {
      state: 'missing' | 'unavailable' | 'invalid';
      subjectId: string;
      assessmentId: null;
      items: readonly StudyItem[];
      notice: string;
    };

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function text(value: unknown, max = 12_000): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export function parseStudySubjectItems(
  value: unknown,
  expectedSubjectId: string,
): StudySubjectItemsRead {
  const root = record(value);
  const subjectId = text(root.subject_id, 64);
  const assessmentId = text(root.assessment_id, 128);
  const rawItems = Array.isArray(root.items) ? root.items : null;

  if (
    root.schema_version !== 1 ||
    subjectId !== expectedSubjectId ||
    !assessmentId ||
    root.status !== 'active' ||
    !rawItems ||
    rawItems.length === 0 ||
    rawItems.length > 200
  ) {
    return {
      state: 'invalid',
      subjectId: expectedSubjectId,
      assessmentId: null,
      items: [],
      notice: 'El set canónico de esta materia no cumple el contrato de Study Engine.',
    };
  }

  const items: StudyItem[] = [];
  const ids = new Set<string>();

  for (const raw of rawItems) {
    const item = record(raw);
    const id = text(item.id, 256);
    const version = positiveInteger(item.version);
    const conceptId = text(item.concept_id, 256);
    const operation =
      typeof item.operation === 'string' && OPERATIONS.has(item.operation as StudyOperation)
        ? (item.operation as StudyOperation)
        : null;
    const channel =
      typeof item.channel === 'string' && CHANNELS.has(item.channel)
        ? (item.channel as 'theoretical' | 'practical' | 'integrative')
        : null;
    const prompt = text(item.prompt);
    const answer = text(item.answer);
    const explanation = text(item.explanation);

    if (
      !id ||
      ids.has(id) ||
      !version ||
      !conceptId ||
      !operation ||
      !channel ||
      item.item_type !== 'recall' ||
      !prompt ||
      !answer ||
      !explanation
    ) {
      return {
        state: 'invalid',
        subjectId: expectedSubjectId,
        assessmentId: null,
        items: [],
        notice: 'El set canónico de esta materia contiene un ítem inválido.',
      };
    }

    ids.add(id);
    items.push({
      id,
      version,
      subjectId,
      conceptId,
      operation,
      channel,
      itemType: 'recall',
      prompt,
      answer,
      explanation,
    });
  }

  return {
    state: 'ready',
    subjectId,
    assessmentId,
    items,
    notice: null,
  };
}
