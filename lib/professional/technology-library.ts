import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveTechnologyLibraryText } from '@/lib/professional/technology-library-contract';
import type { TechnologyLibraryData } from '@/types/technology-library';

const LIBRARY_PATH = path.join(
  process.cwd(),
  'data',
  'generated',
  'technology-library.json',
);

export async function loadTechnologyLibrary(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<TechnologyLibraryData> {
  const readText = options?.readText ?? (() => readFile(LIBRARY_PATH, 'utf8'));

  try {
    return resolveTechnologyLibraryText(await readText(), options?.now);
  } catch {
    return resolveTechnologyLibraryText(null, options?.now);
  }
}
