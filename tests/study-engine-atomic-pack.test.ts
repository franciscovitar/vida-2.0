import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAtomicStudyPack } from '@/lib/study-engine/atomic-pack';
import {
  selectStudySessionItems,
  studyReviewUnitId,
  type StudyItem,
} from '@/lib/study-engine/items';

const pack = {
  schema_version: 1,
  subject_id: 'dsi',
  assessment_id: 'dsi-2026-p3',
  status: 'active',
  review_units: [
    {
      review_unit_id: 'dsi.p3.pattern.state-strategy',
      concept_id: 'DSI.P3.PATTERNS.STATE_STRATEGY',
      facet_id: 'DSI.P3.PATTERNS.STATE_STRATEGY.DISCRIMINATION',
      parent_item_ids: ['dsi-p3-patterns-01'],
      operation: 'discriminate',
      channel: 'theoretical',
      mode_role: 'light',
      variant_family: 'state-vs-strategy',
      source_refs: ['question_bank:dsi-p3-patterns-01'],
      evidence_ceiling: 'discrimination',
      items: [
        {
          id: 'state-strategy-mcq-a',
          interaction: 'mcq_discriminate',
          prompt: '¿Qué diferencia separa mejor State de Strategy?',
          answer: 'State representa transiciones de estado; Strategy intercambia algoritmos.',
          feedback: 'La intención del cambio es distinta.',
          context_freshness: 'familiar',
          options: [
            {
              id: 'a',
              label: 'State modela estados/transiciones; Strategy algoritmos intercambiables.',
            },
            { id: 'b', label: 'State adapta interfaces; Strategy notifica observadores.' },
          ],
          correct_option_id: 'a',
        },
        {
          id: 'state-strategy-mcq-b',
          interaction: 'mcq_discriminate',
          prompt: 'Si el objeto cambia comportamiento al cambiar de estado interno, ¿qué patrón pesa más?',
          answer: 'State',
          feedback: 'El comportamiento depende del estado interno.',
          options: [
            { id: 'state', label: 'State' },
            { id: 'strategy', label: 'Strategy' },
          ],
          correct_option_id: 'state',
        },
      ],
    },
    {
      review_unit_id: 'dsi.p3.observer-role',
      concept_id: 'DSI.P3.PATTERNS.OBSERVER',
      operation: 'recall',
      channel: 'theoretical',
      mode_role: 'light',
      evidence_ceiling: 'factual-retrieval',
      items: [
        {
          id: 'observer-recall',
          interaction: 'recall_reveal',
          prompt: '¿Qué patrón notifica a múltiples interesados cuando cambia un sujeto?',
          answer: 'Observer',
          feedback: 'Observer desacopla sujeto y observadores.',
        },
      ],
    },
    {
      review_unit_id: 'dsi.p3.bridge-bff',
      concept_id: 'DSI.P3.ARCH.BFF',
      operation: 'apply',
      channel: 'integrative',
      mode_role: 'bridge',
      variant_family: 'bff-microcase',
      evidence_ceiling: 'micro-application',
      items: [
        {
          id: 'bff-bridge',
          interaction: 'bridge_microcase',
          prompt: 'Web y mobile necesitan APIs adaptadas a necesidades distintas. ¿Qué patrón considerarías?',
          answer: 'BFF',
          accepted_answers: ['BFF', 'Backend for Frontend'],
          feedback: 'BFF crea un backend específico por tipo de frontend.',
          context_freshness: 'fresh',
        },
      ],
    },
    {
      review_unit_id: 'dsi.p3.true-false',
      concept_id: 'DSI.P3.MICRO.GRANULARITY',
      operation: 'discriminate',
      channel: 'theoretical',
      mode_role: 'light',
      evidence_ceiling: 'claim-discrimination',
      items: [
        {
          id: 'entity-service-vf',
          interaction: 'true_false_correct',
          prompt: 'V/F: cada entidad del dominio debería convertirse en un microservicio.',
          answer: 'Falso: un servicio representa una capacidad/responsabilidad cohesionada.',
          feedback: 'La entidad no define por sí sola el límite de servicio.',
          options: [
            { id: 'true', label: 'Verdadero' },
            { id: 'false', label: 'Falso' },
          ],
          correct_option_id: 'false',
        },
      ],
    },
  ],
};

test('Atomic Study Pack maps semantic interactions to existing Study Engine renderers', () => {
  const parsed = parseAtomicStudyPack(pack, 'dsi', 'dsi-2026-p3');
  assert.equal(parsed.state, 'ready');
  if (parsed.state !== 'ready') return;

  assert.equal(parsed.runtimeKind, 'atomic');
  assert.equal(parsed.items.length, 5);
  assert.deepEqual(
    parsed.items.map((item) => item.itemType),
    ['mcq', 'mcq', 'recall', 'typed', 'mcq'],
  );
  const bridge = parsed.items.find((item) => item.id === 'bff-bridge');
  assert.equal(bridge?.reviewUnitId, 'dsi.p3.bridge-bff');
  assert.equal(bridge?.modeRole, 'bridge');
  assert.equal(bridge?.intendedFreshness, 'fresh');
  assert.equal(bridge?.evidenceCeiling, 'micro-application');
});

test('Atomic Study Pack fails closed on assessment mismatch or invalid binary item', () => {
  assert.equal(parseAtomicStudyPack(pack, 'dsi', 'dsi-2026-p2').state, 'invalid');

  const invalidBinary = structuredClone(pack);
  invalidBinary.review_units[3].items[0].options = [
    { id: 'true', label: 'Verdadero' },
    { id: 'false', label: 'Falso' },
    { id: 'maybe', label: 'Depende' },
  ];
  assert.equal(parseAtomicStudyPack(invalidBinary, 'dsi', 'dsi-2026-p3').state, 'invalid');
});

test('session selection shows one cue per review unit and rotates cue families by date', () => {
  const parsed = parseAtomicStudyPack(pack, 'dsi', 'dsi-2026-p3');
  assert.equal(parsed.state, 'ready');
  if (parsed.state !== 'ready') return;

  const first = selectStudySessionItems(parsed.items, '2026-09-28');
  const second = selectStudySessionItems(parsed.items, '2026-09-29');

  assert.equal(first.length, 4);
  assert.equal(new Set(first.map(studyReviewUnitId)).size, 4);
  assert.equal(new Set(second.map(studyReviewUnitId)).size, 4);

  const stateFirst = first.find(
    (item: StudyItem) => studyReviewUnitId(item) === 'dsi.p3.pattern.state-strategy',
  );
  const stateSecond = second.find(
    (item: StudyItem) => studyReviewUnitId(item) === 'dsi.p3.pattern.state-strategy',
  );
  assert.ok(stateFirst);
  assert.ok(stateSecond);
  assert.notEqual(stateFirst.id, stateSecond.id);
});
