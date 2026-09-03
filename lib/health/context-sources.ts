/**
 * Composición read-only del contexto de otros dominios para Salud.
 *
 * Gimnasio y Nutrición conservan su propia fuente de verdad: acá sólo se leen
 * sus puertos existentes y se los proyecta al mínimo que necesita Salud. Si
 * alguno falla, Salud sigue funcionando y sólo se degrada ese contexto.
 */
import { cache } from 'react';
import 'server-only';

import {
  HEALTH_GYM_UNAVAILABLE,
  HEALTH_NUTRITION_UNAVAILABLE,
  toHealthGymInput,
  toHealthNutritionInput,
  type HealthGymInput,
  type HealthNutritionInput,
} from '@/lib/health/intelligence';

export interface HealthContextInputs {
  gym: HealthGymInput;
  nutrition: HealthNutritionInput;
}

async function loadGymInput(): Promise<HealthGymInput> {
  try {
    const { loadGymSessionsSnapshot } = await import('@/lib/gym/sheets-sessions-port');
    return toHealthGymInput(await loadGymSessionsSnapshot());
  } catch {
    return HEALTH_GYM_UNAVAILABLE;
  }
}

async function loadNutritionInput(): Promise<HealthNutritionInput> {
  try {
    const { loadNutritionDashboardData } = await import('@/lib/nutrition/dashboard');
    return toHealthNutritionInput(await loadNutritionDashboardData());
  } catch {
    return HEALTH_NUTRITION_UNAVAILABLE;
  }
}

async function loadHealthContext(): Promise<HealthContextInputs> {
  const [gym, nutrition] = await Promise.all([loadGymInput(), loadNutritionInput()]);
  return { gym, nutrition };
}

/** Cache por request: una sola lectura de cada dominio de contexto. */
export const getHealthContextInputs = cache(loadHealthContext);
