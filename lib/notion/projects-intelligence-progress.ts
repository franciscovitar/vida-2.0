/**
 * Progreso determinístico de proyecto a partir de sus hitos relacionados.
 * Reglas V1 (ver especificación de la fase):
 *
 * 1. Solo cuentan los hitos relacionados con ese proyecto.
 * 2. Un hito con `Estado = Hecho` aporta su peso declarado completo.
 * 3. Cualquier otro estado válido (`Pendiente`, `En progreso`, `Descartado`)
 *    aporta cero (sin progreso parcial por "En progreso").
 * 4. Estado ausente o no reconocido en cualquier hito relevante → progreso
 *    no medible (nunca se trata como un estado incompleto conocido).
 * 5. Peso ausente en cualquier hito relevante → progreso no medible.
 * 6. Peso no finito o negativo → progreso no medible.
 * 7. Sin hitos → progreso no medible.
 * 8. El modelo canónico de hitos debe sumar exactamente 100; si no, progreso
 *    no medible (nunca se normaliza automáticamente un modelo distinto de
 *    100 puntos).
 * 9. `percent` es exactamente el peso completado, nunca una estimación.
 */
import type { ProjectProgress, ProjectsIntelligenceMilestone } from '@/types/projects-intelligence';

/** Estado "hecho" verificado contra el schema canónico de Hitos de proyecto. */
const MILESTONE_DONE_STATUS = 'Hecho';

/** Tolerancia de punto flotante para la suma de pesos (no un margen de negocio). */
const TOTAL_WEIGHT_TOLERANCE = 1e-9;

const REQUIRED_TOTAL_WEIGHT = 100;

export function isMilestoneCompleted(status: string | null): boolean {
  return status === MILESTONE_DONE_STATUS;
}

export function computeProjectProgress(
  milestones: readonly ProjectsIntelligenceMilestone[],
): ProjectProgress {
  if (milestones.length === 0) {
    return { measurable: false, reason: 'no-milestones' };
  }

  for (const milestone of milestones) {
    if (milestone.status === null) {
      return { measurable: false, reason: 'invalid-status' };
    }
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
