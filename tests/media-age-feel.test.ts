import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ageFeelAffinityAdjustment, deriveAgeFeel } from '@/lib/media/age-feel';

test('sensación de época usa año como base y perfil como ajuste acotado', () => {
  const current = deriveAgeFeel('movie', 2024, null);
  const oldSlow = deriveAgeFeel(
    'movie',
    1975,
    JSON.stringify({ pace: 'slow', visual_emphasis: 'low', dialogue_emphasis: 'high' }),
  );
  const oldFastVisual = deriveAgeFeel(
    'movie',
    1975,
    JSON.stringify({ pace: 'fast', visual_emphasis: 'high' }),
  );

  assert.ok(current && current.score <= 1.5);
  assert.ok(oldSlow && oldSlow.score > 7);
  assert.ok(oldFastVisual && oldSlow && oldFastVisual.score < oldSlow.score);
});

test('perfil inválido no rompe la señal y series permanecen neutrales', () => {
  assert.ok(deriveAgeFeel('movie', 1985, '{invalid-json'));
  assert.equal(deriveAgeFeel('series', 1985, null), null);
});

test('penalización personal es neutra en títulos actuales y acotada en -0.9', () => {
  assert.equal(ageFeelAffinityAdjustment(1), 0);
  assert.equal(ageFeelAffinityAdjustment(2.5), 0);
  assert.ok(ageFeelAffinityAdjustment(6) < 0);
  assert.equal(ageFeelAffinityAdjustment(10), -0.9);
});
