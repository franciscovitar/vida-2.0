/**
 * Extracción y adaptación de propiedades Notion → DTO Projects Intelligence.
 * Tipos de propiedad verificados contra el schema canónico real (no
 * inferidos): ver comentarios por campo.
 *
 * Reglas:
 * - texto opcional ausente → `null` (nunca se fabrica contenido);
 * - enum/select desconocido → `null` (nunca se asume un valor conocido);
 * - relación ausente → `null`/vacío, nunca inventada;
 * - `Próxima acción` es una relación a Tareas: el adaptador solo extrae los
 *   IDs crudos; la resolución contra los nombres de Tarea ocurre en el
 *   ensamblado (`lib/notion/projects-intelligence.ts`), donde ya están
 *   disponibles las Tareas cargadas;
 * - `Estado` de Proyecto queda `null` si falta o no es reconocido — el
 *   ensamblado falla cerrado en ese caso, nunca se asume `Activo`;
 * - peso numérico malformado no se coacciona a cero (ver
 *   `lib/notion/projects-intelligence-progress.ts`);
 * - los campos de snapshot PI (`PI Recomendación`, `PI Confianza`,
 *   `PI Revisado`, `PI Resumen`) se preservan tal cual existen en Notion;
 *   nunca se generan ni se infieren aquí.
 */
import {
  MILESTONE_PROPS,
  MILESTONE_STATUSES,
  PI_RECOMMENDATIONS,
  PROJECT_INTELLIGENCE_PROPS,
  PROJECT_INTELLIGENCE_TYPES,
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
import type { NotionRelation } from '@/types/notion';
import type {
  ProjectsIntelligenceMilestone,
  ProjectsIntelligencePiRecommendation,
  ProjectsIntelligenceProjectStatus,
  ProjectsIntelligenceProjectType,
} from '@/types/projects-intelligence';

/**
 * Campos base del proyecto tal como salen del adaptador, previo a ensamblar
 * hitos/tareas/progreso/calidad. Difiere deliberadamente del DTO final en dos
 * campos que requieren datos de otras fuentes para resolverse:
 * - `status` queda `null` si es inválido (el ensamblado decide fallar cerrado);
 * - `nextAction` queda como IDs crudos de relación (el ensamblado resuelve
 *   contra las Tareas ya cargadas).
 */
export interface ProjectsIntelligenceProjectBase {
  id: string;
  name: string;
  status: ProjectsIntelligenceProjectStatus | null;
  type: ProjectsIntelligenceProjectType | null;
  area: NotionRelation | null;
  expectedResult: string | null;
  definitionOfDone: string | null;
  /** IDs crudos de la relación `Próxima acción` → Tareas, sin resolver. */
  nextActionTaskIds: readonly string[];
  lastAdvance: string | null;
  blocker: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  ownership: string | null;
  piRecommendation: ProjectsIntelligencePiRecommendation | null;
  piConfidence: number | null;
  piReviewedAt: string | null;
  piSummary: string | null;
}

export function adaptProjectIntelligenceBase(page: NotionRawPage): ProjectsIntelligenceProjectBase {
  const props = page.properties;
  const name = titlePlain(props[PROJECT_INTELLIGENCE_PROPS.title]);
  // Sin fallback a 'Activo': un Estado ausente/no reconocido queda null y el
  // ensamblado falla cerrado en vez de fabricar un estado canónico.
  const status = inList(selectName(props[PROJECT_INTELLIGENCE_PROPS.status]), PROJECT_STATUSES);
  const areaIds = relationIds(props[PROJECT_INTELLIGENCE_PROPS.area]);

  return {
    id: page.id,
    name,
    status,
    type: inList(selectName(props[PROJECT_INTELLIGENCE_PROPS.type]), PROJECT_INTELLIGENCE_TYPES),
    // Este lector no consulta Áreas: el nombre queda sin resolver a propósito.
    area: resolveRelation(areaIds, new Map()),
    expectedResult: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.expectedResult]),
    definitionOfDone: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.definitionOfDone]),
    // RELATION → Tareas (no texto libre); ver resolución en el ensamblado.
    nextActionTaskIds: relationIds(props[PROJECT_INTELLIGENCE_PROPS.nextAction]),
    lastAdvance: dateStart(props[PROJECT_INTELLIGENCE_PROPS.lastAdvance]),
    blocker: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.blocker]),
    dueDate: dateStart(props[PROJECT_INTELLIGENCE_PROPS.dueDate]),
    reviewDate: dateStart(props[PROJECT_INTELLIGENCE_PROPS.reviewDate]),
    ownership: richTextPlain(props[PROJECT_INTELLIGENCE_PROPS.ownership]),
    piRecommendation: inList(
      selectName(props[PROJECT_INTELLIGENCE_PROPS.piRecommendation]),
      PI_RECOMMENDATIONS,
    ),
    piConfidence: numberValue(props[PROJECT_INTELLIGENCE_PROPS.piConfidence]),
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
    // Ausente o no reconocido queda null; nunca se asume un estado incompleto conocido.
    status: inList(selectName(props[MILESTONE_PROPS.status]), MILESTONE_STATUSES),
    weight: numberValue(props[MILESTONE_PROPS.weight]),
    completionCriteria: richTextPlain(props[MILESTONE_PROPS.completionCriteria]),
    evidence: richTextPlain(props[MILESTONE_PROPS.evidence]),
    order: numberValue(props[MILESTONE_PROPS.order]),
    completedAt: dateStart(props[MILESTONE_PROPS.completedAt]),
    ownership: richTextPlain(props[MILESTONE_PROPS.ownership]),
  };
}
