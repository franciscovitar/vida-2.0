import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveCareerResilienceText } from '@/lib/professional/career-resilience-contract';
import type { CareerResilienceData } from '@/types/career-resilience';

const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'generated', 'ai-career-resilience.json');

export async function loadCareerResilience(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<CareerResilienceData> {
  const readText = options?.readText ?? (() => readFile(SNAPSHOT_PATH, 'utf8'));
  try {
    return resolveCareerResilienceText(await readText(), options?.now);
  } catch {
    return resolveCareerResilienceText(null, options?.now);
  }
}
