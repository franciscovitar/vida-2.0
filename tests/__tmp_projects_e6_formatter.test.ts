import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import prettier from 'prettier';

const paths = [
  'components/projects/ProjectsIntelligenceDashboard.tsx',
  'lib/projects/intelligence-view.ts',
  'tests/projects-intelligence-view.test.ts',
] as const;

test('temporary exact Prettier report for E6', async () => {
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    const formatted = await prettier.format(source, { ...(options ?? {}), filepath: path });
    console.log(`__PRETTIER_BEGIN__${path}`);
    console.log(Buffer.from(formatted, 'utf8').toString('base64'));
    console.log(`__PRETTIER_END__${path}`);
  }
});
