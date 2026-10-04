import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { format } from 'prettier';

const files = [
  'lib/world/feedback.ts',
  'tests/world-feedback.test.ts',
  'tests/world-intelligence.test.ts',
] as const;

test('WORLD-P10-TEMP. dump exact repo-configured Prettier output', async () => {
  for (const file of files) {
    const formatted = await format(readFileSync(file, 'utf8'), {
      filepath: file,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
    });
    console.log(`@@WORLD_P10_PRETTIER_START:${file}@@`);
    console.log(Buffer.from(formatted, 'utf8').toString('base64'));
    console.log(`@@WORLD_P10_PRETTIER_END:${file}@@`);
  }
});
