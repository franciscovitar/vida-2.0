/**
 * Extracción y adaptación de propiedades Notion → DTO Projects Intelligence.
 *
 * Reglas:
 * - texto opcional ausente → `null` (nunca se fabrica contenido);
 * - enum/select desconocido → `null` (Estado usa el enum cerrado existente);
 * - relación ausente → `null`/vacío, nunca inventada;
 * - peso numérico malformado no se coacciona a cero (ver
 *   `lib/notion/projects-intelligence-progress.ts`);
 * - los campos de snapshot PI (`PI Recomendación`, `PI Confianza`,
 *   `PI Revisado`, `PI Resumen`) se preservan tal cual existen en Notion;
 *   nunca se generan ni se infieren aquí.
 */
import {
  MILESTONE_PROPS,
  PROJECT_INTELLIGENCE_PROPS,
  PROJECT_STATUSES,
} from '@/lib/notion/constants';
import { resolveRelation, type NotionRawPage } from '@/lib/notion/adapters';
import {
  dateStart,
  inList,
  numberValue,
  relationIds,
  richTextPlain,
  selectName,
  titlePlain,
} from '@/lib/notion/property-parsers';
import type {
  ProjectsIntelligenceMilestone,
  ProjectsIntelligenceProject,
  ProjectsIntelligenceProjectStatus,
} from '@/types/projects-intelligence';

/**
 * Extrae texto de una propiedad cuyo tipo exacto en Notion no fue verificado
 * en este pase (rich_text, select/status, date o number). Nunca inventa un
 * valor: si ninguna forma conocida produce contenido, devuelve `null`.
 */
function flexibleText(prop: unknown): string | null {
  const text = richTextPlain(prop);
  if (text !== null) return text;
  const select = selectName(prop);
  if (select !== null) return select;
  const date = dateStart(prop);
  if (date !== null) return date;
  const num = numberValue(prop);
  if (num !== null) return String(num);
  return null;
}

/** Campos base del proyecto, previo a ensamblar hitos/tareas/progreso/calidad. */
export type ProjectsIntelligenceProjectBase = Omit<
  ProjectsIntelligenceProject,
  | 'relatedTaskCount'
  | 'openTaskCount'
  | 'blockedTaskCount'
  | 'relatedTasks'
  | 'milestones'
  | 'progress'
  | 'quality'
>;

export function adaptProjectIntelligenceBase(page: NotionRawPage): ProjectsIntelligenceProjectBase {
  const props = page.properties;
  const name = titlePlain(props[PROJECT_INTELLIGENCE_PROPS.title]);
  const status =
    inList(selectName(props[PROJECT_INTELLIGENCE_PROPS.status]), PROJECT_STATUSES) ??
    ('Activo' as ProjectsIntelligenceProjectStatus);
  const areaIds = relationIds(props[PROJECT_INTELLIGENCE_PROPS.area]);

  return {
    id: page.id,
    name,
    status,
    type: flexibleText(props[PROJECT_INTELLIGENCE_PROPS.type]),
    // Este lector no consulta Áreas: el nombre queda sin resolver a propósito.
    area: resolveRelation(areaIds, new Map()),
    expectedResult: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.expectedResult]),
    definitionOfDone: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.definitionOfDone]),
    nextAction: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.nextAction]),
    lastAdvance: flexibleText(props[PROJECT_INTELLIGENCE_PROPS.lastAdvance]),
    blocker: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.blocker]),
    dueDate: dateStart(props[PROJECT_INTELLIGENCE_PROPS.dueDate]),
    reviewDate: dateStart(props[PROJECT_INTELLIGENCE_PROPS.reviewDate]),
    ownership: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.ownership]),
    piRecommendation: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.piRecommendation]),
    piConfidence: flexibleText(props[PROJECT_INTELLIGENCE_PROPS.piConfidence]),
    piReviewedAt: dateStart(props[PROJECT_INTELLIGENCE_PROPS.piReviewedAt]),
    piSummary: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.piSummary]),
  };
}

export function adaptMilestone(page: NotionRawPage): ProjectsIntelligenceMilestone {
  const props = page.properties;
  const projectIds = relationIds(props[MILESTONE_PROPS.project]);

  return {
    id: page.id,
    name: titlePlain(props[MILESTONE_PROPS.title]),
    projectId: projectIds[0] ?? null,
    status: selectName(props[MILESTONE_PROPS.status]),
    weight: numberValue(props[MILESTONE_PROPS.weight]),
    completionCriteria: richTextPlain(props[MILESTONE_PROPS.completionCriteria]),
    evidence: richTextPlain(props[MILESTONE_PROPS.evidence]),
    order: numberValue(props[MILESTONE_PROPS.order]),
    completedAt: dateStart(props[MILESTONE_PROPS.completedAt]),
    ownership: richTextPlain(props[MILESTONE_PROPS.ownership]),
  };
}
