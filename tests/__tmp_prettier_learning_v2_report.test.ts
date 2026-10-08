import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { format } from 'prettier';

test('TEMP: report exact Prettier output for Learning Hub V2', async () => {
  const file = 'components/learning/LearningHubV2.tsx';
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
  console.log(`__PRETTIER_LEARNING_V2_BEGIN__\n${formatted}__PRETTIER_LEARNING_V2_END__`);
});
