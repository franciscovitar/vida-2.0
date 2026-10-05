import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  resolveWorldTemporalIndexText,
  resolveWorldTemporalPeriodText,
} from '@/lib/world/temporal-contract';
import type {
  WorldTemporalIndex,
  WorldTemporalIndexEntry,
  WorldTemporalPeriod,
} from '@/types/world-intelligence';

const ROOT = path.join(process.cwd(), 'data', 'generated', 'world', 'temporal');
const INDEX_PATH = path.join(ROOT, 'index.json');

export { selectWorldTemporalEntry } from '@/lib/world/temporal-contract';

export async function loadWorldTemporalIndex(options?: {
  readText?: () => Promise<string>;
}): Promise<WorldTemporalIndex | null> {
  const readText = options?.readText ?? (() => readFile(INDEX_PATH, 'utf8'));

  try {
    return resolveWorldTemporalIndexText(await readText());
  } catch {
    return null;
  }
}

export async function loadWorldTemporalPeriod(
  entry: WorldTemporalIndexEntry,
  options?: { readText?: () => Promise<string> },
): Promise<WorldTemporalPeriod | null> {
  const localPath = path.join(ROOT, entry.localRef);
  const readText = options?.readText ?? (() => readFile(localPath, 'utf8'));

  try {
    const period = resolveWorldTemporalPeriodText(await readText());
    if (!period || period.periodKey !== entry.periodKey || period.state !== entry.state) {
      return null;
    }
    return period;
  } catch {
    return null;
  }
}
