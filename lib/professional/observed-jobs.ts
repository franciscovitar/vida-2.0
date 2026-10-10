import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  resolveObservedJobs,
  type ObservedJobSampleData,
} from '@/lib/professional/observed-jobs-contract';

const SOURCE = path.join(process.cwd(), 'data', 'generated', 'professional-observed-jobs-c2.json');

export async function loadObservedJobs(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<ObservedJobSampleData> {
  const reader = options?.readText ?? (() => readFile(SOURCE, 'utf8'));
  try {
    return resolveObservedJobs(await reader(), options?.now);
  } catch {
    return resolveObservedJobs(null, options?.now);
  }
}
