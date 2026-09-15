import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';

import prettier from 'prettier';

const execFileAsync = promisify(execFile);
const TARGETS = [
  'lib/media/season-rating-write.ts',
  'lib/media/season-rating.ts',
  'tests/media-season-rating.test.ts',
] as const;

test('temporary prettier probe', async () => {
  for (const path of TARGETS) {
    const source = await readFile(path, 'utf8');
    const formatted = await prettier.format(source, {
      filepath: path,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
    });
    await writeFile(path, formatted, 'utf8');
  }

  const { stdout } = await execFileAsync('git', ['diff', '--', ...TARGETS]);
  console.log('FORMAT_DIFF_START');
  console.log(stdout);
  console.log('FORMAT_DIFF_END');
  assert.ok(stdout.length > 0);
});
