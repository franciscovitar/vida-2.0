'use server';

import { revalidatePath } from 'next/cache';

import { isWriteActionsEnabled } from '@/lib/actions/config';
import { verifySession } from '@/lib/auth/dal';
import { planningTaskCrudFromEnv } from '@/lib/tasks/web-crud';
import type {
  PlanningTaskArchiveInput,
  PlanningTaskCreateInput,
  PlanningTaskMutationResult,
  PlanningTaskUpdateInput,
} from '@/types/planning';

async function serviceOrError(): Promise<
  | { ok: true; service: NonNullable<ReturnType<typeof planningTaskCrudFromEnv>> }
  | { ok: false; result: PlanningTaskMutationResult }
> {
  const session = await verifySession();
  if (!session.ok) {
    return {
      ok: false,
      result: { ok: false, code: 'unavailable', message: 'Tenés que iniciar sesión.' },
    };
  }
  if (!isWriteActionsEnabled()) {
    return {
      ok: false,
      result: { ok: false, code: 'disabled', message: 'Las escrituras están desactivadas.' },
    };
  }
  const service = planningTaskCrudFromEnv();
  if (!service) {
    return {
      ok: false,
      result: { ok: false, code: 'unavailable', message: 'Notion no está configurado para escritura.' },
    };
  }
  return { ok: true, service };
}

function refreshPlanning() {
  revalidatePath('/planificacion');
  revalidatePath('/tareas');
  revalidatePath('/');
  revalidatePath('/areas');
}

export async function createPlanningTask(
  input: PlanningTaskCreateInput,
): Promise<PlanningTaskMutationResult> {
  const ready = await serviceOrError();
  if (!ready.ok) return ready.result;
  const result = await ready.service.create(input);
  if (result.ok) refreshPlanning();
  return result;
}

export async function updatePlanningTask(
  input: PlanningTaskUpdateInput,
): Promise<PlanningTaskMutationResult> {
  const ready = await serviceOrError();
  if (!ready.ok) return ready.result;
  const result = await ready.service.update(input);
  if (result.ok) refreshPlanning();
  return result;
}

export async function archivePlanningTask(
  input: PlanningTaskArchiveInput,
): Promise<PlanningTaskMutationResult> {
  const ready = await serviceOrError();
  if (!ready.ok) return ready.result;
  const result = await ready.service.archive(input);
  if (result.ok) refreshPlanning();
  return result;
}
