import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import prettier from 'prettier';

const paths = [
  'components/planning/PlanningWorkspaceV2.tsx',
  'lib/planning/week-v2.ts',
  'tests/planning-week-v2.test.ts',
] as const;

test('temporary one-shot E7 formatting report', async () => {
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    const output = await prettier.format(source, { ...(options ?? {}), filepath: path });
    console.log(`__PRETTIER_BEGIN__${path}`);
    console.log(Buffer.from(output, 'utf8').toString('base64'));
    console.log(`__PRETTIER_END__${path}`);
  }
});
