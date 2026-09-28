import type {
  StudyItem,
  StudyItemFreshness,
  StudyItemInteraction,
  StudyItemModeRole,
  StudyOperation,
} from '@/lib/study-engine/items';
import type { RichContentBlock } from '@/lib/study-engine/rich-content';
import type { StudySubjectItemsRead } from '@/lib/study-engine/subject-items';

const OPERATIONS = new Set<StudyOperation>([
  'recall',
  'explain',
  'discriminate',
  'apply',
  'select',
  'calculate',
  'interpret',
]);
const CHANNELS = new Set(['theoretical', 'practical', 'integrative']);
const MODE_ROLES = new Set<StudyItemModeRole>(['light', 'bridge']);
const FRESHNESS = new Set<StudyItemFreshness>(['familiar', 'fresh', 'transfer', 'delayed']);
const INTERACTIONS = new Set<StudyItemInteraction>([
  'recall_reveal',
  'short_typed',
  'mcq_discriminate',
  'true_false_correct',
  'cloze_context',
  'bridge_microcase',
  'next_step',
  'microcalc',
  'visual_probe',
]);

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function text(value: unknown, max = 12_000): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function optionalText(value: unknown, max = 512): string | null {
  if (value === null || value === undefined || value === '') return null;
  return text(value, max);
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function stringArray(value: unknown, maxItems = 50, maxChars = 512): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: string[] = [];
  for (const item of value) {
    const parsed = text(item, maxChars);
    if (!parsed) return null;
    result.push(parsed);
  }
  return result;
}

function parseOptions(value: unknown): Array<{ id: string; label: string }> | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) return null;
  const ids = new Set<string>();
  const options: Array<{ id: string; label: string }> = [];
  for (const raw of value) {
    const option = record(raw);
    const id = text(option.id, 64);
    const label = text(option.label, 1000);
    if (!id || !label || ids.has(id)) return null;
    ids.add(id);
    options.push({ id, label });
  }
  return options;
}

function parsePromptContent(value: unknown): RichContentBlock[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 12) return null;
  const blocks: RichContentBlock[] = [];
  for (const raw of value) {
    const block = record(raw);
    const kind = text(block.kind, 32);
    if (!kind) return null;
    if (kind === 'markdown') {
      const markdown = text(block.markdown, 20_000);
      if (!markdown) return null;
      blocks.push({ kind, markdown });
      continue;
    }
    if (kind === 'html') {
      const html = text(block.html, 30_000);
      if (!html) return null;
      blocks.push({ kind, html });
      continue;
    }
    if (kind === 'code') {
      const code = text(block.code, 20_000);
      const language = optionalText(block.language, 64) ?? undefined;
      if (!code) return null;
      blocks.push({ kind, code, language });
      continue;
    }
    if (kind === 'math') {
      const tex = text(block.tex, 5000);
      if (!tex || (block.display !== undefined && typeof block.display !== 'boolean')) return null;
      blocks.push({ kind, tex, display: block.display === true });
      continue;
    }
    if (kind === 'image') {
      const src = text(block.src, 1_000_000);
      const alt = text(block.alt, 500);
      const caption = optionalText(block.caption, 1000) ?? undefined;
      if (!src || !alt) return null;
      blocks.push({ kind, src, alt, caption });
      continue;
    }
    return null;
  }
  return blocks;
}

function invalid(subjectId: string, notice = 'El Atomic Study Pack contiene datos inválidos.'): StudySubjectItemsRead {
  return { state: 'invalid', subjectId, assessmentId: null, items: [], notice, runtimeKind: null };
}

export function parseAtomicStudyPack(
  value: unknown,
  expectedSubjectId: string,
  expectedAssessmentId: string | null = null,
): StudySubjectItemsRead {
  const root = record(value);
  const subjectId = text(root.subject_id, 64);
  const assessmentId = text(root.assessment_id, 128);
  const rawUnits = Array.isArray(root.review_units) ? root.review_units : null;

  if (
    root.schema_version !== 1 ||
    root.status !== 'active' ||
    subjectId !== expectedSubjectId ||
    !assessmentId ||
    (expectedAssessmentId !== null && assessmentId !== expectedAssessmentId) ||
    !rawUnits ||
    rawUnits.length === 0 ||
    rawUnits.length > 1000
  ) {
    return invalid(expectedSubjectId, 'El Atomic Study Pack no cumple el contrato canónico.');
  }

  const items: StudyItem[] = [];
  const unitIds = new Set<string>();
  const itemIds = new Set<string>();

  for (const rawUnit of rawUnits) {
    const unit = record(rawUnit);
    const reviewUnitId = text(unit.review_unit_id, 256);
    const conceptId = text(unit.concept_id, 256);
    const facetId = optionalText(unit.facet_id, 256);
    const operation =
      typeof unit.operation === 'string' && OPERATIONS.has(unit.operation as StudyOperation)
        ? (unit.operation as StudyOperation)
        : null;
    const channel =
      typeof unit.channel === 'string' && CHANNELS.has(unit.channel)
        ? (unit.channel as 'theoretical' | 'practical' | 'integrative')
        : null;
    const modeRole =
      typeof unit.mode_role === 'string' && MODE_ROLES.has(unit.mode_role as StudyItemModeRole)
        ? (unit.mode_role as StudyItemModeRole)
        : null;
    const variantFamily = optionalText(unit.variant_family, 256);
    const evidenceCeiling = text(unit.evidence_ceiling, 256);
    const parentItemIds = stringArray(unit.parent_item_ids);
    const sourceRefs = stringArray(unit.source_refs, 100, 1000);
    const unitFreshness =
      typeof unit.context_freshness === 'string' &&
      FRESHNESS.has(unit.context_freshness as StudyItemFreshness)
        ? (unit.context_freshness as StudyItemFreshness)
        : 'familiar';
    const rawItems = Array.isArray(unit.items) ? unit.items : null;

    if (
      !reviewUnitId ||
      unitIds.has(reviewUnitId) ||
      !conceptId ||
      !operation ||
      !channel ||
      !modeRole ||
      !evidenceCeiling ||
      parentItemIds === null ||
      sourceRefs === null ||
      !rawItems ||
      rawItems.length === 0 ||
      rawItems.length > 20
    ) {
      return invalid(expectedSubjectId);
    }
    unitIds.add(reviewUnitId);

    for (const rawItem of rawItems) {
      const item = record(rawItem);
      const id = text(item.id, 256);
      const version = item.version === undefined ? 1 : positiveInteger(item.version);
      const interaction =
        typeof item.interaction === 'string' &&
        INTERACTIONS.has(item.interaction as StudyItemInteraction)
          ? (item.interaction as StudyItemInteraction)
          : null;
      const prompt = text(item.prompt);
      const answer = text(item.answer);
      const explanation = text(item.feedback) ?? text(item.explanation) ?? answer;
      const acceptedAnswers = stringArray(item.accepted_answers, 30, 1000);
      const promptContent = parsePromptContent(item.prompt_content);
      const intendedFreshness =
        typeof item.context_freshness === 'string' &&
        FRESHNESS.has(item.context_freshness as StudyItemFreshness)
          ? (item.context_freshness as StudyItemFreshness)
          : unitFreshness;

      if (
        !id ||
        itemIds.has(id) ||
        !version ||
        !interaction ||
        !prompt ||
        !answer ||
        !explanation ||
        acceptedAnswers === null ||
        promptContent === null
      ) {
        return invalid(expectedSubjectId);
      }
      itemIds.add(id);

      const base = {
        id,
        version,
        subjectId,
        conceptId,
        operation,
        channel,
        reviewUnitId,
        facetId,
        variantFamily,
        evidenceCeiling,
        modeRole,
        interaction,
        intendedFreshness,
        parentItemIds,
        sourceRefs,
        prompt,
        answer,
        explanation,
        promptContent: promptContent.length ? promptContent : undefined,
      } as const;

      if (interaction === 'recall_reveal') {
        items.push({ ...base, itemType: 'recall' });
        continue;
      }

      if (interaction === 'mcq_discriminate' || interaction === 'true_false_correct') {
        const options = parseOptions(item.options);
        const correctOptionId = text(item.correct_option_id, 64);
        if (
          !options ||
          !correctOptionId ||
          !options.some((option) => option.id === correctOptionId) ||
          (interaction === 'true_false_correct' && options.length !== 2)
        ) {
          return invalid(expectedSubjectId, 'El Atomic Study Pack contiene un MCQ/binario inválido.');
        }
        items.push({ ...base, itemType: 'mcq', options, correctOptionId });
        continue;
      }

      const normalizedAccepted = acceptedAnswers.length > 0 ? acceptedAnswers : [answer];

      if (interaction === 'cloze_context') {
        items.push({
          ...base,
          itemType: 'cloze',
          acceptedAnswers: normalizedAccepted,
          placeholder: optionalText(item.placeholder, 200) ?? undefined,
        });
        continue;
      }

      if (
        interaction === 'short_typed' ||
        interaction === 'bridge_microcase' ||
        interaction === 'next_step' ||
        interaction === 'microcalc' ||
        interaction === 'visual_probe'
      ) {
        if (interaction === 'visual_probe' && promptContent.length === 0) {
          return invalid(
            expectedSubjectId,
            'Un visual_probe requiere prompt_content seguro para mostrarse antes de responder.',
          );
        }
        items.push({
          ...base,
          itemType: 'typed',
          acceptedAnswers: normalizedAccepted,
          placeholder: optionalText(item.placeholder, 200) ?? undefined,
        });
        continue;
      }
      return invalid(expectedSubjectId);
    }
  }

  if (items.length === 0 || items.length > 2000) return invalid(expectedSubjectId);

  return {
    state: 'ready',
    subjectId,
    assessmentId,
    items,
    notice: null,
    runtimeKind: 'atomic',
  };
}
