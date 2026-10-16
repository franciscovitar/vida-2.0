import 'server-only';

import { cache } from 'react';

import { getPrivatePasReader } from '@/lib/private-pas/source';
import { buildStudyCatalogSubject } from '@/lib/study-engine/catalog';
import type { StudyCatalogRead, StudyCatalogSubject } from '@/types/study-catalog';

const SUBJECT_IDS = ['cdd', 'dao', 'dsi', 'green', 'iop', 'redes', 'tpa'] as const;
const SUBJECT_ROOT = 'AI/projects/university/subjects';

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function unavailableRead(state: 'unconfigured' | 'unavailable'): StudyCatalogRead {
  return {
    state,
    subjects: [],
    notice:
      state === 'unconfigured'
        ? 'La lectura privada del catálogo todavía no está configurada.'
        : 'No se pudo leer el catálogo académico privado. No se muestra información desactualizada.',
    sourceCommit: null,
  };
}

async function loadPrivateCatalog(): Promise<StudyCatalogRead> {
  const reader = getPrivatePasReader();
  if (!reader) return unavailableRead('unconfigured');

  try {
    const sourceCommit = await reader.sourceCommit();
    const subjects = await Promise.all(
      SUBJECT_IDS.map(async (subjectId): Promise<StudyCatalogSubject | null> => {
        const base = `${SUBJECT_ROOT}/${subjectId}`;
        const [subject, current, rootBlueprint, inventory, readiness, learningFiles] =
          await Promise.all([
            reader.readJson(`${base}/subject.json`),
            reader.readJson(`${base}/state/current.json`),
            reader.readJson(`${base}/learning/assessment_blueprint.json`),
            reader.readJson(`${base}/learning/concept_inventory.json`),
            reader.readJson(`${base}/learning/readiness_report.json`),
            reader.listLearningFiles(`${base}/learning`),
          ]);
        if (!subject || typeof subject !== 'object') return null;

        const currentRecord = objectRecord(current);
        const assignment = currentRecord.active_assignment;
        const assignmentObject =
          assignment && typeof assignment === 'object' && !Array.isArray(assignment)
            ? (assignment as Record<string, unknown>)
            : {};
        const nestedStudy = assignmentObject.study;
        const nestedStudyRecord = objectRecord(nestedStudy);
        const currentAssessmentId =
          (typeof currentRecord.next_assessment === 'string' && currentRecord.next_assessment) ||
          (typeof nestedStudyRecord.assessment_id === 'string' &&
            nestedStudyRecord.assessment_id) ||
          (typeof assignmentObject.id === 'string' && assignmentObject.id) ||
          (typeof assignment === 'string' && assignment);

        let blueprint = rootBlueprint;
        const blueprintRecord = objectRecord(blueprint);
        if (
          typeof blueprintRecord.assessment_id === 'string' &&
          blueprintRecord.assessment_id !== currentAssessmentId
        ) {
          blueprint = {};
        }

        const inventoryRecord = objectRecord(inventory);
        const readinessRecord = objectRecord(readiness);
        const currentInventory =
          typeof inventoryRecord.assessment_id === 'string' &&
          inventoryRecord.assessment_id &&
          inventoryRecord.assessment_id !== currentAssessmentId
            ? {}
            : inventory;
        const currentReadiness =
          currentAssessmentId && readinessRecord.assessment_id === currentAssessmentId
            ? readiness
            : {};

        const status = objectRecord(subject).status;
        if (status !== 'active') return null;
        return buildStudyCatalogSubject({
          subjectId,
          subject,
          current,
          blueprint,
          conceptInventory: currentInventory,
          readiness: currentReadiness,
          learningFiles,
        });
      }),
    );

    return {
      state: 'ready',
      subjects: subjects
        .filter((subject): subject is StudyCatalogSubject => Boolean(subject))
        .sort((left, right) => left.name.localeCompare(right.name, 'es')),
      notice: null,
      sourceCommit,
    };
  } catch {
    return unavailableRead('unavailable');
  }
}

export const getUniversityStudyCatalog = cache(loadPrivateCatalog);
