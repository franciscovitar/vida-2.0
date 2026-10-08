import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import prettier from 'prettier';

const paths = [
  'components/habits/HabitsV2Board.tsx',
  'lib/habits/v2-contract.ts',
  'lib/habits/v2-source.ts',
  'lib/habits/v2-write-core.ts',
  'tests/habits-v2-contract.test.ts',
  'tests/habits-v2-write.test.ts',
] as const;

test('temporary exact Prettier report for Habits V2 files', async () => {
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    const formatted = await prettier.format(text, {
      ...(options ?? {}),
      filepath: path,
    });
    console.log(`__PRETTIER_BEGIN__${path}`);
    console.log(Buffer.from(formatted, 'utf8').toString('base64'));
    console.log(`__PRETTIER_END__${path}`);
  }
});
