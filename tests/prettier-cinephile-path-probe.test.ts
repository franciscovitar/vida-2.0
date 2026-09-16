import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const TARGETS = [
  'components/media/MediaDetailDialog.tsx',
  'lib/media/cinephile-path.ts',
  'tests/media-cinephile-path.test.ts',
];

test('temporary cinephile path prettier probe emits exact diff', () => {
  execFileSync(process.execPath, ['node_modules/prettier/bin/prettier.cjs', '--write', ...TARGETS], {
    stdio: 'inherit',
  });
  const diff = execFileSync('git', ['diff', '--', ...TARGETS], { encoding: 'utf8' });
  console.log('\nPRETTIER_CINEPHILE_DIFF_START\n' + diff + '\nPRETTIER_CINEPHILE_DIFF_END');
  assert.equal(diff, '', 'temporary probe intentionally fails while formatting differs');
});
