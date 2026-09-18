import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveProfessionalSnapshotText } from '@/lib/professional/contract';
import type { ProfessionalIntelligenceData } from '@/types/professional-intelligence';

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'professional-snapshot.json',
);

export async function loadProfessionalSnapshot(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<ProfessionalIntelligenceData> {
  const readText = options?.readText ?? (() => readFile(SNAPSHOT_PATH, 'utf8'));

  try {
    const raw = await readText();
    return resolveProfessionalSnapshotText(raw, options?.now);
  } catch {
    return resolveProfessionalSnapshotText(null, options?.now);
  }
}
