import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { format, resolveConfig } from 'prettier';

function diffLines(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }

    const chunk: string[] = [];
    while (
      i < a.length ||
      j < b.length
    ) {
      if (i < a.length && j < b.length && a[i] === b[j]) break;
      if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) {
        chunk.push(`+${b[j]}`);
        j += 1;
      } else if (i < a.length) {
        chunk.push(`-${a[i]}`);
        i += 1;
      }
    }
    out.push(...chunk, '---');
  }
  return out.join('\n');
}

test('PRETTIER-DIAGNOSTIC exact project formatting delta', async () => {
  const paths = [
    'lib/projects/intelligence-view.ts',
    'tests/projects-intelligence-view.test.ts',
  ];

  for (const path of paths) {
    const input = readFileSync(path, 'utf8');
    const config = (await resolveConfig(path)) ?? {};
    const output = await format(input, { ...config, filepath: path });
    console.log(`PRETTIER-DIFF-BEGIN ${path}\n${diffLines(input, output)}\nPRETTIER-DIFF-END ${path}`);
    assert.equal(input, output, `${path} must match Prettier`);
  }
});
