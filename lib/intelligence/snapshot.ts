import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  resolveIntelligenceArticleText,
  resolveIntelligenceEditorialSnapshotText,
} from '@/lib/intelligence/contract';
import type {
  IntelligenceArticleData,
  IntelligenceArticleSummary,
  IntelligenceEditorialData,
  IntelligenceEditorialSnapshot,
} from '@/types/intelligence-editorial';

const SNAPSHOT_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'intelligence-editorial-snapshot.json',
);

function articlePath(summary: IntelligenceArticleSummary): string {
  return path.join(
    process.cwd(),
    'data',
    'generated',
    'intelligence',
    'articles',
    summary.front,
    `${summary.slug}.json`,
  );
}

export async function loadIntelligenceEditorialSnapshot(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<IntelligenceEditorialData> {
  const readText = options?.readText ?? (() => readFile(SNAPSHOT_PATH, 'utf8'));

  try {
    return resolveIntelligenceEditorialSnapshotText(await readText(), options?.now);
  } catch {
    return resolveIntelligenceEditorialSnapshotText(null, options?.now);
  }
}

export async function loadIntelligenceArticle(
  snapshot: IntelligenceEditorialSnapshot,
  summary: IntelligenceArticleSummary,
  options?: {
    readText?: () => Promise<string>;
    now?: Date;
  },
): Promise<IntelligenceArticleData> {
  const readText = options?.readText ?? (() => readFile(articlePath(summary), 'utf8'));

  try {
    return resolveIntelligenceArticleText(await readText(), summary, snapshot, options?.now);
  } catch {
    return resolveIntelligenceArticleText(null, summary, snapshot, options?.now);
  }
}
