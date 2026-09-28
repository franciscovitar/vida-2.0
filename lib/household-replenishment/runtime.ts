import 'server-only';

import { MemoryReplenishmentRepository } from './memory-store';
import { ReplenishmentService } from './service';

export const PRIMARY_HOUSEHOLD_ID = 'primary-household';

export type HouseholdReplenishmentRuntime =
  | {
      state: 'ready';
      householdId: string;
      service: ReplenishmentService;
    }
  | {
      state: 'disabled' | 'not-configured';
      notice: string;
    };

let memoryRuntime: Extract<HouseholdReplenishmentRuntime, { state: 'ready' }> | null = null;

function createMemoryRuntime(): Extract<HouseholdReplenishmentRuntime, { state: 'ready' }> {
  const repository = new MemoryReplenishmentRepository({
    households: [
      {
        id: PRIMARY_HOUSEHOLD_ID,
        name: 'Lista de casa',
        createdAt: new Date().toISOString(),
      },
    ],
  });

  return {
    state: 'ready',
    householdId: PRIMARY_HOUSEHOLD_ID,
    service: new ReplenishmentService(repository),
  };
}

export function getHouseholdReplenishmentRuntime(
  env: NodeJS.ProcessEnv = process.env,
): HouseholdReplenishmentRuntime {
  if (env.HOUSEHOLD_REPLENISHMENT_ENABLED !== 'true') {
    return {
      state: 'disabled',
      notice: 'La lista inteligente todavía no está habilitada en este entorno.',
    };
  }

  const source = env.HOUSEHOLD_REPLENISHMENT_DATA_SOURCE?.trim().toLowerCase();
  if (source !== 'memory') {
    return {
      state: 'not-configured',
      notice: 'Falta configurar un almacenamiento operativo para la lista del hogar.',
    };
  }

  if (env.NODE_ENV === 'production') {
    return {
      state: 'not-configured',
      notice: 'El almacenamiento temporal de desarrollo no se habilita en producción.',
    };
  }

  memoryRuntime ??= createMemoryRuntime();
  return memoryRuntime;
}
