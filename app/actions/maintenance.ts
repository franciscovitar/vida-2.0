'use server';

/**
 * Server Action de mantenimiento: repara el único rollback legacy inconsistente
 * de `task.create` mientras Safe Writes está OFF.
 *
 * No recibe argumentos de identidad de recurso desde el cliente. El target y la
 * prueba de propiedad se derivan del ledger dentro de la capa de dominio.
 */
import { revalidatePath } from 'next/cache';

import { isWriteActionsEnabled } from '@/lib/actions/config';
import {
  buildTaskRollbackMaintenanceDeps,
  inspectLegacyTaskRollbackRepair,
  repairSingleLegacyTaskCreateRollback,
  type LegacyTaskRollbackRepairState,
} from '@/lib/actions/task-rollback-maintenance';
import { verifySession } from '@/lib/auth/dal';

/** Estado sanitizado para la Card condicional de `/ajustes`. Sin sesión: no revela nada. */
export async function loadLegacyTaskRollbackRepairState(): Promise<LegacyTaskRollbackRepairState> {
  const session = await verifySession();
  if (!session.ok) return 'none';
  if (isWriteActionsEnabled()) return 'disabled';
  const built = buildTaskRollbackMaintenanceDeps();
  if (!built.ok) return built.state;
  const { state } = await inspectLegacyTaskRollbackRepair(built.deps);
  return state;
}

/**
 * Ejecuta la reparación. Fail-closed: requiere sesión y Safe Writes OFF.
 * `revalidatePath` solo tras una reparación efectiva.
 */
export async function repairLegacyTaskRollbackAction(): Promise<{
  ok: boolean;
  state: LegacyTaskRollbackRepairState;
}> {
  const session = await verifySession();
  if (!session.ok) return { ok: false, state: 'none' };
  if (isWriteActionsEnabled()) return { ok: false, state: 'disabled' };

  const built = buildTaskRollbackMaintenanceDeps();
  if (!built.ok) return { ok: false, state: built.state };

  const result = await repairSingleLegacyTaskCreateRollback(built.deps);

  if (result.ok && result.outcome === 'repaired') {
    revalidatePath('/ajustes');
    revalidatePath('/tareas');
  }

  return { ok: result.ok, state: result.state };
}
