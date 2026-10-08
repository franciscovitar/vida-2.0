import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { shouldRenderStagedDailyOrientationV2 } from '@/lib/daily-planning/orientation-rollout';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';

function orientation(
  overrides: Partial<Pick<DailyOrientationView, 'generatedAt' | 'review'>> = {},
): Pick<DailyOrientationView, 'generatedAt' | 'review'> {
  return {
    generatedAt: '2026-10-08T08:00:00-03:00',
    review: {
      date: '2026-10-07',
      headline: 'Resumen confirmado',
      items: [],
      uncertainties: [],
    },
    ...overrides,
  };
}

test('F-ROLL1. Flag off keeps certified V1 even with a valid V2 snapshot', () => {
  assert.equal(shouldRenderStagedDailyOrientationV2(false, orientation()), false);
  assert.equal(shouldRenderStagedDailyOrientationV2(false, null), false);
});

test('F-ROLL2. Flag on with no V2 row stays on V1 during staged migration', () => {
  assert.equal(shouldRenderStagedDailyOrientationV2(true, null), false);
  assert.equal(
    shouldRenderStagedDailyOrientationV2(true, orientation({ generatedAt: null, review: null })),
    false,
  );
});

test('F-ROLL3. V2 loader returning no persisted review cannot displace V1', () => {
  assert.equal(
    shouldRenderStagedDailyOrientationV2(true, orientation({ generatedAt: null })),
    false,
  );
  assert.equal(shouldRenderStagedDailyOrientationV2(true, orientation({ review: null })), false);
});

test('F-ROLL4. Flag on and persisted daily review can switch the view to V2', () => {
  assert.equal(shouldRenderStagedDailyOrientationV2(true, orientation()), true);
});

test('F-ROLL5. Both Hoy and Planificacion routes actually use the staged selector', () => {
  const routes = ['app/(app)/page.tsx', 'app/(app)/planificacion/page.tsx'];
  for (const path of routes) {
    const content = readFileSync(path, 'utf8');
    assert.match(content, /shouldRenderStagedDailyOrientationV2\(v2Enabled, orientation\)/);
    assert.doesNotMatch(content, /\{v2Enabled && orientation \?/);
  }
});
