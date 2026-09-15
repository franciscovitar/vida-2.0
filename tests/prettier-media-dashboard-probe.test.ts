import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const TARGET = 'components/media/MediaDashboard.tsx';

test('temporary MediaDashboard prettier probe emits the exact diff', () => {
  execFileSync(process.execPath, ['node_modules/prettier/bin/prettier.cjs', '--write', TARGET], {
    stdio: 'inherit',
  });
  const diff = execFileSync('git', ['diff', '--', TARGET], { encoding: 'utf8' });
  console.log('\nPRETTIER_MEDIA_DASHBOARD_DIFF_START\n' + diff + '\nPRETTIER_MEDIA_DASHBOARD_DIFF_END');
  assert.equal(diff, '', 'temporary probe intentionally fails while formatting differs');
});
