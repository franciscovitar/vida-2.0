import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { format, resolveConfig } from 'prettier';

const TARGETS = [
  'app/(app)/aprendizaje/estudio/[subjectId]/page.tsx',
  'docs/atomic-study-pack.md',
  'lib/study-engine/atomic-pack.ts',
  'lib/study-engine/catalog-source.ts',
  'lib/study-engine/fresh-evidence.ts',
  'lib/study-engine/items.ts',
  'lib/study-engine/subject-items-source.ts',
  'tests/study-engine-atomic-pack.test.ts',
  'tests/study-engine-attempt-store.test.ts',
] as const;

test('capture canonical Prettier output for Atomic Study changes', async () => {
  for (const path of TARGETS) {
    const source = await readFile(path, 'utf8');
    const config = (await resolveConfig(path)) ?? {};
    const formatted = await format(source, { ...config, filepath: path });
    const encoded = Buffer.from(formatted, 'utf8').toString('base64');
    console.log('PRETTIER_CAPTURE|' + encodeURIComponent(path) + '|' + encoded);
  }
});
