/**
 * Progreso determinístico de proyecto a partir de sus hitos relacionados.
 * Reglas V1 (ver especificación de la fase):
 *
 * 1. Solo cuentan los hitos relacionados con ese proyecto.
 * 2. Un hito completado aporta su peso declarado completo.
 * 3. Cualquier hito no completado aporta cero (sin progreso parcial por
 *    "En progreso").
 * 4. Peso ausente en cualquier hito relevante → progreso no medible.
 * 5. Peso no finito o negativo → progreso no medible.
 * 6. Sin hitos → progreso no medible.
 * 7. El modelo canónico de hitos debe sumar exactamente 100; si no, progreso
 *    no medible (nunca se normaliza automáticamente un modelo distinto de
 *    100 puntos).
 * 8. `percent` es exactamente el peso completado, nunca una estimación.
 */
import type { ProjectProgress, ProjectsIntelligenceMilestone } from '@/types/projects-intelligence';

/** Convención de estado "completado" para hitos, alineada con `PROJECT_STATUSES`. */
const MILESTONE_COMPLETED_STATUS = 'Completado';

/** Tolerancia de punto flotante para la suma de pesos (no un margen de negocio). */
const TOTAL_WEIGHT_TOLERANCE = 1e-9;

const REQUIRED_TOTAL_WEIGHT = 100;

export function isMilestoneCompleted(status: string | null): boolean {
  return status === MILESTONE_COMPLETED_STATUS;
}

export function computeProjectProgress(
  milestones: readonly ProjectsIntelligenceMilestone[],
): ProjectProgress {
  if (milestones.length === 0) {
    return { measurable: false, reason: 'no-milestones' };
  }

  for (const milestone of milestones) {
    if (milestone.weight === null) {
      return { measurable: false, reason: 'missing-weight' };
    }
    if (!Number.isFinite(milestone.weight) || milestone.weight < 0) {
      return { measurable: false, reason: 'invalid-weight' };
    }
  }

  const totalWeight = milestones.reduce((sum, milestone) => sum + (milestone.weight ?? 0), 0);
  if (Math.abs(totalWeight - REQUIRED_TOTAL_WEIGHT) > TOTAL_WEIGHT_TOLERANCE) {
    return { measurable: false, reason: 'invalid-total' };
  }

  const completedWeight = milestones
    .filter((milestone) => isMilestoneCompleted(milestone.status))
    .reduce((sum, milestone) => sum + (milestone.weight ?? 0), 0);

  return {
    measurable: true,
    percent: completedWeight,
    completedWeight,
    totalWeight,
  };
}
