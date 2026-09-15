import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const TARGETS = [
  'lib/media/external-ratings-fetch.ts',
  'lib/media/external-ratings.ts',
];

test('temporary prettier probe emits the exact diff', () => {
  execFileSync(process.execPath, ['node_modules/prettier/bin/prettier.cjs', '--write', ...TARGETS], {
    stdio: 'inherit',
  });
  const diff = execFileSync('git', ['diff', '--', ...TARGETS], { encoding: 'utf8' });
  console.log('\nPRETTIER_EXTERNAL_RATINGS_DIFF_START\n' + diff + '\nPRETTIER_EXTERNAL_RATINGS_DIFF_END');
  assert.equal(diff, '', 'temporary probe intentionally fails while formatting differs');
});
