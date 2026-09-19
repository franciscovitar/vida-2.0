import 'server-only';

import { fetchAccessToken } from '@/lib/google/auth';

import {
  readRhythmDayFromDriveCore,
  readRhythmWindowFromDriveCore,
  type RhythmDriveDayRead,
  type RhythmDriveWindowRead,
} from './rhythm-drive-source-core';
import type { NormalizedRhythmDay } from './rhythm-source-adapter';

const deps = {
  fetchFn: fetch,
  getToken: fetchAccessToken,
};

export async function readRhythmDayFromDrive(input: {
  date: string;
  previous?: NormalizedRhythmDay | null;
}): Promise<RhythmDriveDayRead> {
  return readRhythmDayFromDriveCore({ ...input, env: process.env }, deps);
}

export async function readRhythmWindowFromDrive(input: {
  dates: readonly string[];
  previous?: readonly NormalizedRhythmDay[];
}): Promise<RhythmDriveWindowRead> {
  return readRhythmWindowFromDriveCore({ ...input, env: process.env }, deps);
}
