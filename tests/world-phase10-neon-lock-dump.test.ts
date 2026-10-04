import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('WORLD-P10-TEMP. generate exact Neon dependency lockfile', () => {
  execFileSync(
    'npm',
    [
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '@neondatabase/serverless@^1.0.2',
    ],
    { stdio: 'pipe' },
  );

  for (const file of ['package.json', 'package-lock.json']) {
    console.log(`@@WORLD_P10_NEON_LOCK_START:${file}@@`);
    console.log(Buffer.from(readFileSync(file)).toString('base64'));
    console.log(`@@WORLD_P10_NEON_LOCK_END:${file}@@`);
  }
});
