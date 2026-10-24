import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveLibrary360Text } from '@/lib/professional/library-360-contract';
import type { Library360Data } from '@/types/library-360';

const DERIVATIVE_PATH = path.join(process.cwd(), 'data', 'generated', 'library-360.json');

export async function loadLibrary360(options?: {
  readText?: () => Promise<string>;
  now?: Date;
}): Promise<Library360Data> {
  const readText = options?.readText ?? (() => readFile(DERIVATIVE_PATH, 'utf8'));
  try {
    return resolveLibrary360Text(await readText(), options?.now);
  } catch {
    return resolveLibrary360Text(null, options?.now);
  }
}
