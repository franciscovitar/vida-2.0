import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const TARGETS = [
  'components/media/CinephilePathPanel.tsx',
  'lib/media/cinephile-canon.ts',
  'lib/media/cinephile-path.ts',
  'tests/media-cinephile-canon.test.ts',
];

test('temporary external canon prettier probe emits exact diff', () => {
  execFileSync(process.execPath, ['node_modules/prettier/bin/prettier.cjs', '--write', ...TARGETS], {
    stdio: 'inherit',
  });
  const diff = execFileSync('git', ['diff', '--', ...TARGETS], { encoding: 'utf8' });
  console.log('\nPRETTIER_CANON_DIFF_START\n' + diff + '\nPRETTIER_CANON_DIFF_END');
  assert.equal(diff, '', 'temporary probe intentionally fails while formatting differs');
});
