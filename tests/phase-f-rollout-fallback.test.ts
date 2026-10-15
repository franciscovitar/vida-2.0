import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { shouldRenderStagedDailyOrientationV2 } from '@/lib/daily-planning/orientation-rollout';
import type { DailyOrientationView } from '@/types/daily-orientation-v2';

function orientation(
  overrides: Partial<Pick<DailyOrientationView, 'readStatus' | 'generatedAt' | 'review'>> = {},
): Pick<DailyOrientationView, 'readStatus' | 'generatedAt' | 'review'> {
  return {
    readStatus: 'ready',
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

test('F-ROLL2. Flag on shows a truthful V2 empty state instead of masking it', () => {
  assert.equal(shouldRenderStagedDailyOrientationV2(true, null), false);
  assert.equal(
    shouldRenderStagedDailyOrientationV2(
      true,
      orientation({ readStatus: 'empty', generatedAt: null, review: null }),
    ),
    true,
  );
});

test('F-ROLL3. Confirmed empty V2 remains visible while no snapshot is saved', () => {
  assert.equal(
    shouldRenderStagedDailyOrientationV2(
      true,
      orientation({ readStatus: 'empty', generatedAt: null }),
    ),
    true,
  );
  assert.equal(
    shouldRenderStagedDailyOrientationV2(true, orientation({ readStatus: 'empty', review: null })),
    true,
  );
});

test('F-ROLL4. Flag on and persisted daily review can switch the view to V2', () => {
  assert.equal(shouldRenderStagedDailyOrientationV2(true, orientation()), true);
});

test('F-ROLL5. Hoy keeps staged selection; Planificacion chooses a minimal V2 route', () => {
  const hoy = readFileSync('app/(app)/page.tsx', 'utf8');
  assert.ok(hoy.includes('shouldRenderStagedDailyOrientationV2(v2Enabled, orientation)'));
  const planning = readFileSync('app/(app)/planificacion/page.tsx', 'utf8');
  assert.ok(planning.includes('if (isDailyPlanningV2UiEnabled())'));
  assert.ok(planning.includes('<MinimalPlanningOverview orientation={orientation} />'));
  assert.ok(planning.includes('<PlanningWorkspace'));
  assert.doesNotMatch(planning, /shouldRenderStagedDailyOrientationV2/);
});

test('F-ROLL6. Read failure does not silently switch to V1', () => {
  for (const readStatus of ['invalid', 'unavailable'] as const) {
    assert.equal(
      shouldRenderStagedDailyOrientationV2(
        true,
        orientation({ readStatus, generatedAt: null, review: null }),
      ),
      true,
    );
  }
});

test('F-ROLL7. Invalid rows with a valid newest snapshot remain visible as degraded V2', () => {
  assert.equal(
    shouldRenderStagedDailyOrientationV2(true, orientation({ readStatus: 'invalid' })),
    true,
  );
});

test('F-ROLL8. Flag off keeps V1, including during source failure', () => {
  assert.equal(
    shouldRenderStagedDailyOrientationV2(
      false,
      orientation({ readStatus: 'unavailable', generatedAt: null, review: null }),
    ),
    false,
  );
});

test('F-ROLL9. Recovery and confirmed empty both keep an enabled V2 visible', () => {
  const error = orientation({ readStatus: 'unavailable', generatedAt: null, review: null });
  const refreshed = orientation({ readStatus: 'ready' });
  const empty = orientation({ readStatus: 'empty', generatedAt: null, review: null });
  assert.equal(shouldRenderStagedDailyOrientationV2(true, error), true);
  assert.equal(shouldRenderStagedDailyOrientationV2(true, refreshed), true);
  assert.equal(shouldRenderStagedDailyOrientationV2(true, empty), true);
});
