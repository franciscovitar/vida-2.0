import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import prettier from 'prettier';

const TARGETS = [
  'lib/media/season-rating-write.ts',
  'lib/media/season-rating.ts',
  'tests/media-season-rating.test.ts',
] as const;

test('temporary prettier probe', async () => {
  for (const path of TARGETS) {
    const source = await readFile(path, 'utf8');
    const formatted = await prettier.format(source, {
      filepath: path,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
    });
    console.log(`FORMAT_PROBE_START:${path}`);
    console.log(Buffer.from(formatted, 'utf8').toString('base64'));
    console.log(`FORMAT_PROBE_END:${path}`);
  }
  assert.ok(true);
});
