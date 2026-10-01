import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { format } from 'prettier';

const OPTIONS = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all' as const,
  endOfLine: 'lf' as const,
  parser: 'typescript',
};

for (const path of [
  'lib/finance/reporting/cash-flow-core.ts',
  'lib/finance/reporting/cash-flow.ts',
]) {
  test(`prettier diagnostic: ${path}`, async () => {
    const source = await readFile(path, 'utf8');
    const formatted = await format(source, OPTIONS);
    console.log(`PRETTIER_BEGIN:${path}`);
    console.log(Buffer.from(formatted, 'utf8').toString('base64'));
    console.log(`PRETTIER_END:${path}`);
  });
}
