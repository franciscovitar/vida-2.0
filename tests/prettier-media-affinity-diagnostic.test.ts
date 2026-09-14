import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import * as prettier from 'prettier';

const FILES = [
  'lib/media/display-affinity.ts',
  'lib/media/load.ts',
  'lib/media/sheets-read.ts',
] as const;

test('diagnóstico temporal: imprime formato exacto de Media affinity', async () => {
  for (const file of FILES) {
    const source = await readFile(file, 'utf8');
    const formatted = await prettier.format(source, {
      filepath: file,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
    });
    console.log(`PRETTIER_DIAGNOSTIC_BEGIN:${file}`);
    console.log(Buffer.from(formatted, 'utf8').toString('base64'));
    console.log(`PRETTIER_DIAGNOSTIC_END:${file}`);
  }
});
