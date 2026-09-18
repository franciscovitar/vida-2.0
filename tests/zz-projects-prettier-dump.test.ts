import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import * as prettier from 'prettier';

test('emit canonical Projects component formatting for CI repair', async () => {
  const path = 'components/projects/ProjectsIntelligenceDashboard.tsx';
  const source = await readFile(path, 'utf8');
  const config = await prettier.resolveConfig(path);
  const formatted = await prettier.format(source, {
    ...config,
    filepath: path,
  });

  console.log('__PROJECTS_PRETTIER_BEGIN__');
  console.log(Buffer.from(formatted, 'utf8').toString('base64'));
  console.log('__PROJECTS_PRETTIER_END__');
});
