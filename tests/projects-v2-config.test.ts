import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isProjectsV2SignalsEnabled } from '@/lib/projects/v2-config';

test('Projects E6 is independently off by default', () => {
  assert.equal(isProjectsV2SignalsEnabled({}), false);
  assert.equal(isProjectsV2SignalsEnabled({ PROJECTS_E6_SIGNALS_ENABLED: 'false' }), false);
  assert.equal(isProjectsV2SignalsEnabled({ PROJECTS_E6_SIGNALS_ENABLED: 'TRUE' }), false);
  assert.equal(isProjectsV2SignalsEnabled({ PROJECTS_E6_SIGNALS_ENABLED: 'true' }), true);
});
