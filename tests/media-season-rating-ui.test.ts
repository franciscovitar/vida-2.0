import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detailSource = readFileSync('components/media/MediaDetailDialog.tsx', 'utf8');
const controlSource = readFileSync('components/media/SeasonRatingControl.tsx', 'utf8');

test('season detail makes missing personal ratings explicit without fabricating them', () => {
  assert.match(detailSource, /con nota tuya/);
  assert.match(detailSource, /Sin registrar/);
  assert.doesNotMatch(detailSource, /rating=\{item\.rating\}/);
});

test('saving a season rating does not force-close the media detail', () => {
  assert.doesNotMatch(detailSource, /SeasonRatingControl[\s\S]{0,200}onSaved=\{onClose\}/);
  assert.match(controlSource, /Nota guardada\./);
});
