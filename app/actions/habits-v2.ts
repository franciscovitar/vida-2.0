'use server';

import { revalidatePath } from 'next/cache';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { verifySession } from '@/lib/auth/dal';
import { isHabitsV2WritesEnabled } from '@/lib/habits/v2-config';
import type {
  AddHabitV2Input,
  DeactivateHabitV2Input,
  HabitV2MutationResult,
  ToggleHabitV2Input,
} from '@/lib/habits/v2-contract';
import { createGoogleHabitsV2Port } from '@/lib/habits/v2-google-port';
import { createHabitsV2WriteService } from '@/lib/habits/v2-write-core';

function unavailable(message: string): HabitV2MutationResult {
  return { ok: false, code: 'unavailable', message };
}

async function service() {
  const session = await verifySession();
  if (!session.ok) return null;

  return createHabitsV2WriteService({
    port: createGoogleHabitsV2Port(),
    today: todayInBuenosAires(),
    writesEnabled: isHabitsV2WritesEnabled(),
  });
}

function refreshHabits() {
  revalidatePath('/habitos');
  revalidatePath('/');
}

export async function toggleHabitV2Action(
  input: ToggleHabitV2Input,
): Promise<HabitV2MutationResult> {
  const ready = await service();
  if (!ready) return unavailable('Tenés que iniciar sesión.');
  try {
    const result = await ready.toggle(input);
    if (result.ok) refreshHabits();
    return result;
  } catch {
    return unavailable('No se pudo guardar el hábito.');
  }
}

export async function addManualHabitV2Action(
  input: AddHabitV2Input,
): Promise<HabitV2MutationResult> {
  const ready = await service();
  if (!ready) return unavailable('Tenés que iniciar sesión.');
  try {
    const result = await ready.addManual(input);
    if (result.ok) refreshHabits();
    return result;
  } catch {
    return unavailable('No se pudo crear el hábito.');
  }
}

export async function deactivateHabitV2Action(
  input: DeactivateHabitV2Input,
): Promise<HabitV2MutationResult> {
  const ready = await service();
  if (!ready) return unavailable('Tenés que iniciar sesión.');
  try {
    const result = await ready.deactivate(input);
    if (result.ok) refreshHabits();
    return result;
  } catch {
    return unavailable('No se pudo desactivar el hábito.');
  }
}
