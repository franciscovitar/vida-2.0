import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveIntelligenceEditorialSnapshotText } from '@/lib/intelligence/contract';
import type { IntelligenceEditorialData } from '@/types/intelligence-editorial';

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'intelligence-editorial-snapshot.json',
);

export async function loadIntelligenceEditorialSnapshot(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<IntelligenceEditorialData> {
  const readText = options?.readText ?? (() => readFile(SNAPSHOT_PATH, 'utf8'));

  try {
    const raw = await readText();
    return resolveIntelligenceEditorialSnapshotText(raw, options?.now);
  } catch {
    return resolveIntelligenceEditorialSnapshotText(null, options?.now);
  }
}
