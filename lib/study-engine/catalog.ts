import type {
  StudyCatalogAssessment,
  StudyCatalogStudySet,
  StudyCatalogSubject,
  StudyCatalogTopic,
  StudySubjectWithProgress,
} from '@/types/study-catalog';
import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';

type JsonObject = Record<string, unknown>;

export interface StudyCatalogSubjectInput {
  subjectId: string;
  subject: unknown;
  current: unknown;
  blueprint: unknown;
  conceptInventory: unknown;
  readiness: unknown;
  learningFiles: readonly string[];
}

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function prettyToken(value: string): string {
  const exact: Record<string, string> = {
    PREENUNCIADO: 'Preenunciado',
    SUBDOMAINS: 'Subdominios',
    FUNCTIONAL_VIEW: 'Vista funcional',
    CU_JUSTIFICATION: 'Justificación de CU',
    RNF_JUSTIFICATION: 'Justificación de RNF',
    MICRO_GLOBAL: 'Micro · diseño global',
    MICRO_DETAILED: 'Micro · diseño detallado',
    MICRO_DEPLOYMENT: 'Micro · despliegue',
    MONO_DESIGN: 'Monolito · diseño',
    MONO_DEPLOYMENT: 'Monolito · despliegue',
  };
  if (exact[value]) return exact[value];

  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function deriveStudySets(files: readonly string[]): StudyCatalogStudySet[] {
  const grouped = new Map<string, StudyCatalogStudySet & { labels: string[] }>();

  for (const file of files) {
    let match = /^P(\d+)_(PRACTICE|THEORY)_(\d{2})_(.+)\.md$/i.exec(file);
    let channel: StudyCatalogStudySet['channel'] = 'content';
    let sequence: string | null = null;
    let labelToken: string | null = null;
    let period = '';

    if (match) {
      period = match[1] ?? '';
      channel = match[2]?.toUpperCase() === 'PRACTICE' ? 'practice' : 'theory';
      sequence = match[3] ?? null;
      labelToken = match[4] ?? null;
    } else {
      match = /^P(\d+)_(\d{2})_(.+)\.md$/i.exec(file);
      if (!match) continue;
      period = match[1] ?? '';
      sequence = match[2] ?? null;
      labelToken = match[3] ?? null;
    }

    if (!sequence || !labelToken) continue;
    const key = `p${period}:${channel}:${sequence}`;
    const label = prettyToken(labelToken);
    const existing = grouped.get(key);

    if (existing) {
      if (!existing.labels.includes(label)) existing.labels.push(label);
      continue;
    }

    grouped.set(key, {
      id: key,
      label,
      labels: [label],
      channel,
      sequence,
    });
  }

  return [...grouped.values()]
    .sort((left, right) => {
      const channelOrder = { theory: 0, practice: 1, content: 2 };
      const byChannel = channelOrder[left.channel] - channelOrder[right.channel];
      return byChannel || (left.sequence ?? '').localeCompare(right.sequence ?? '');
    })
    .map(({ labels, ...set }) => ({
      ...set,
      label: labels.join(' / '),
    }));
}

function scopeIsComplete(status: string | null): boolean {
  if (!status) return false;
  return status === 'resolved' || status.startsWith('complete');
}

function assessmentFrom(
  blueprintValue: unknown,
  currentValue: unknown,
  sourceScopeStatus: string | null,
): StudyCatalogAssessment | null {
  const blueprint = record(blueprintValue);
  const current = record(currentValue);
  const id =
    stringValue(blueprint.assessment_id) ??
    stringValue(current.next_assessment) ??
    stringValue(current.active_assignment);

  if (!id) return null;

  return {
    id,
    status: stringValue(blueprint.status),
    date: stringValue(blueprint.date),
    format: stringValue(blueprint.format),
    scopeComplete: scopeIsComplete(sourceScopeStatus),
  };
}

function topicLabelFromBlueprint(block: string, blueprintValue: unknown): string {
  const blueprint = record(blueprintValue);
  const weights = Array.isArray(blueprint.topic_weights) ? blueprint.topic_weights : [];

  for (const raw of weights) {
    const item = record(raw);
    const label = stringValue(item.block);
    if (label?.startsWith(block)) {
      return label.replace(/^\d+\s*/, '').trim();
    }
  }

  return `Bloque ${block}`;
}

function deriveTopics(
  subjectId: string,
  assessmentId: string | null,
  conceptInventoryValue: unknown,
  blueprintValue: unknown,
  studySets: readonly StudyCatalogStudySet[],
): StudyCatalogTopic[] {
  const inventory = record(conceptInventoryValue);
  const topics: StudyCatalogTopic[] = [];
  const families = record(inventory.families);
  const scope = stringArray(inventory.scope);

  if (Object.keys(families).length > 0) {
    for (const key of Object.keys(families).sort()) {
      const members = Array.isArray(families[key]) ? families[key] : [];
      const label = scope.find((item) => item.toUpperCase().startsWith(key.toUpperCase())) ?? key;
      topics.push({
        id: `${subjectId}:${assessmentId ?? 'scope'}:${key.toLowerCase()}`,
        label,
        conceptCount: members.length,
        studySets: [],
      });
    }
    return topics;
  }

  const concepts = Array.isArray(inventory.concepts) ? inventory.concepts : [];
  const byBlock = new Map<string, number>();

  for (const raw of concepts) {
    const concept = record(raw);
    const block = stringValue(concept.block);
    if (!block) continue;
    byBlock.set(block, (byBlock.get(block) ?? 0) + 1);
  }

  if (byBlock.size > 0) {
    for (const [block, count] of [...byBlock.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      topics.push({
        id: `${subjectId}:${assessmentId ?? 'scope'}:block:${block}`,
        label: topicLabelFromBlueprint(block, blueprintValue),
        conceptCount: count,
        studySets: studySets.filter((set) => set.sequence === block),
      });
    }
    return topics;
  }

  const blueprint = record(blueprintValue);
  const blueprintScope = stringArray(blueprint.scope);
  if (blueprintScope.length > 0) {
    return blueprintScope.map((label, index) => ({
      id: `${subjectId}:${assessmentId ?? 'scope'}:scope:${index + 1}`,
      label,
      conceptCount: null,
      studySets: [],
    }));
  }

  if (studySets.length > 0) {
    const groups: Array<StudyCatalogStudySet['channel']> = ['theory', 'practice', 'content'];
    for (const channel of groups) {
      const sets = studySets.filter((set) => set.channel === channel);
      if (sets.length === 0) continue;
      const label =
        channel === 'practice'
          ? 'Práctica'
          : channel === 'theory'
            ? 'Teoría'
            : 'Material por bloques';
      topics.push({
        id: `${subjectId}:${assessmentId ?? 'scope'}:${channel}`,
        label,
        conceptCount: null,
        studySets: sets,
      });
    }
  }

  return topics;
}

export function buildStudyCatalogSubject(input: StudyCatalogSubjectInput): StudyCatalogSubject {
  const subject = record(input.subject);
  const current = record(input.current);
  const inventory = record(input.conceptInventory);
  const readiness = record(input.readiness);

  const sourceScopeStatus = stringValue(inventory.source_scope_status);
  const assessment = assessmentFrom(input.blueprint, input.current, sourceScopeStatus);
  const studySets = deriveStudySets(input.learningFiles);
  const topics = deriveTopics(
    input.subjectId,
    assessment?.id ?? null,
    input.conceptInventory,
    input.blueprint,
    studySets,
  );

  const concepts = Array.isArray(inventory.concepts) ? inventory.concepts : [];
  const families = record(inventory.families);
  const familyConceptCount = Object.values(families).reduce<number>(
    (sum, value) => sum + (Array.isArray(value) ? value.length : 0),
    0,
  );
  const conceptCount = concepts.length || familyConceptCount;

  const structureStatus =
    topics.length > 0 && scopeIsComplete(sourceScopeStatus)
      ? 'resolved'
      : topics.length > 0 || stringValue(current.current_unit)
        ? 'partial'
        : 'unresolved';

  return {
    id: input.subjectId,
    name: stringValue(subject.name) ?? input.subjectId.toUpperCase(),
    term: stringValue(subject.term),
    currentUnit: stringValue(current.current_unit),
    assessment,
    structureStatus,
    sourceScopeStatus,
    conceptCount,
    topics,
    readinessBand: stringValue(readiness.band),
    updated:
      stringValue(readiness.updated) ??
      stringValue(current.updated) ??
      stringValue(subject.last_reviewed),
    studyRuntimeAvailable:
      input.learningFiles.includes('study_engine_items_v1.json') ||
      input.learningFiles.includes('atomic_study'),
  };
}

export function matchSubjectProgress(
  subject: StudyCatalogSubject,
  snapshots: readonly AssessmentProgressSnapshot[],
): StudySubjectWithProgress {
  const assessmentId = subject.assessment?.id;
  const progress = assessmentId
    ? (snapshots.find(
        (snapshot) => snapshot.subjectId === subject.id && snapshot.assessmentId === assessmentId,
      ) ?? null)
    : null;

  return { ...subject, progress };
}
