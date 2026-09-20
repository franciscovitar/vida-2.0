'use server';

import { revalidatePath } from 'next/cache';

import { verifySession } from '@/lib/auth/dal';
import { getGoogleConfig } from '@/lib/data/config';
import {
  HEALTH_CHECKIN_WRITE_MESSAGES,
  todayInCordoba,
  upsertHealthCheckinWithPort,
  type HealthCheckinDraft,
  type HealthCheckinWriteResult,
} from '@/lib/health/checkin';
import { googleHealthCheckinSheetPort } from '@/lib/health/checkin-google-port';

export type HealthCheckinActionResult =
  | HealthCheckinWriteResult
  | { ok: false; code: 'unauthorized-session'; message: string };

export async function saveHealthCheckinAction(
  input: HealthCheckinDraft,
): Promise<HealthCheckinActionResult> {
  const session = await verifySession();
  if (!session.ok) {
    return {
      ok: false,
      code: 'unauthorized-session',
      message: 'Tenés que iniciar sesión para guardar el check-in.',
    };
  }

  const config = getGoogleConfig();
  if (!config.ok) {
    return {
      ok: false,
      code: 'not-configured',
      message: HEALTH_CHECKIN_WRITE_MESSAGES['not-configured'],
    };
  }

  try {
    const result = await upsertHealthCheckinWithPort(input, googleHealthCheckinSheetPort, {
      targetDate: todayInCordoba(),
      now: new Date(),
      target: {
        target: config.config.target,
        writesAllowed: config.config.writesAllowed,
      },
    });
    if (result.ok) revalidatePath('/salud');
    return JSON.parse(JSON.stringify(result)) as HealthCheckinActionResult;
  } catch {
    return {
      ok: false,
      code: 'write-error',
      message: HEALTH_CHECKIN_WRITE_MESSAGES['write-error'],
    };
  }
}
