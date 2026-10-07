import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { format } from 'prettier';

const FILES = [
  'lib/daily-planning/orientation-v2.ts',
  'types/daily-orientation-v2.ts',
] as const;

test('TEMP: report exact Prettier output for V2 files', async () => {
  for (const file of FILES) {
    const source = await readFile(file, 'utf8');
    const formatted = await format(source, {
      filepath: file,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
    });
    console.log(`__PRETTIER_BEGIN__${file}\n${formatted}__PRETTIER_END__${file}`);
  }
});
