import 'server-only';

import { fetchAccessToken } from '@/lib/google/auth';

import {
  readRhythmDayFromDriveCore,
  readRhythmWindowFromDriveCore,
  type RhythmDriveDayRead,
  type RhythmDriveEnv,
  type RhythmDriveWindowRead,
} from './rhythm-drive-source-core';
import type { NormalizedRhythmDay } from './rhythm-source-adapter';

const deps = {
  fetchFn: fetch,
  getToken: fetchAccessToken,
};

function runtimeEnv(): RhythmDriveEnv {
  return {
    HEALTH_RHYTHM_SOURCE: process.env.HEALTH_RHYTHM_SOURCE,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_HEALTH_SLEEP_FOLDER_ID: process.env.GOOGLE_HEALTH_SLEEP_FOLDER_ID,
    GOOGLE_HEALTH_RHYTHM_FOLDER_ID: process.env.GOOGLE_HEALTH_RHYTHM_FOLDER_ID,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

export async function readRhythmDayFromDrive(input: {
  date: string;
  previous?: NormalizedRhythmDay | null;
}): Promise<RhythmDriveDayRead> {
  return readRhythmDayFromDriveCore({ ...input, env: runtimeEnv() }, deps);
}

export async function readRhythmWindowFromDrive(input: {
  dates: readonly string[];
  previous?: readonly NormalizedRhythmDay[];
}): Promise<RhythmDriveWindowRead> {
  return readRhythmWindowFromDriveCore({ ...input, env: runtimeEnv() }, deps);
}
