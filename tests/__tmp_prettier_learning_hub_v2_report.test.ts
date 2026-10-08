import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import prettier from 'prettier';

const targets = ['components/learning/LearningHubV2.tsx'] as const;

test('temporary Prettier report for Learning Hub V2', async () => {
  for (const target of targets) {
    const source = readFileSync(target, 'utf8');
    const formatted = await prettier.format(source, {
      parser: 'typescript',
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
    });
    console.log(`__PRETTIER_BEGIN__${target}`);
    console.log(Buffer.from(formatted, 'utf8').toString('base64'));
    console.log(`__PRETTIER_END__${target}`);
  }
});
