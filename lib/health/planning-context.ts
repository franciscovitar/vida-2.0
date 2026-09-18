import type { HealthDailyBrief } from '@/lib/health/intelligence';
import type {
  DailyPlanningHealthContext,
  DailyPlanningHealthSourceStatus,
  DailyPlanningSourceState,
} from '@/types/daily-planning-intelligence';

export interface DailyPlanningHealthRead {
  source: DailyPlanningSourceState<DailyPlanningHealthSourceStatus>;
  context: DailyPlanningHealthContext | null;
}

export function unavailableDailyPlanningHealth(
  notice = 'Salud: contexto de capacidad no disponible.',
): DailyPlanningHealthRead {
  return {
    source: { status: 'unavailable', available: false, notice },
    context: null,
  };
}

/**
 * Proyección deliberadamente mínima para Daily Planning.
 *
 * No expone biometría, evidencia por métrica, recomendaciones sanitarias ni
 * contexto de Gym/Nutrition. Salud puede informar capacidad, pero no posee la
 * prioridad de proyectos/tareas ni decide el horario.
 */
export function toDailyPlanningHealth(brief: HealthDailyBrief): DailyPlanningHealthRead {
  const limited = brief.state === 'INSUFICIENTE' || brief.confidence === 'BAJA';
  return {
    source: {
      status: limited ? 'limited' : 'ready',
      available: true,
      notice: limited
        ? 'Salud: evidencia insuficiente para ajustar capacidad con confianza.'
        : null,
    },
    context: {
      state: brief.state,
      confidence: brief.confidence,
      headline: brief.headline,
      canInformCapacity: !limited,
    },
  };
}
