import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

test('English Speaking snapshot is a real sanitized learner projection', () => {
  const path = join(process.cwd(), 'lib/english-learning/profile.snapshot.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

  assert.equal(raw.schema_version, 1);
  assert.equal(raw.project_id, 'english-speaking-lab');
  assert.ok(raw.baseline_status === 'collecting' || raw.baseline_status === 'ready');
  assert.equal(typeof raw.summary, 'string');
  assert.equal(typeof raw.updated, 'string');
  assert.ok(raw.dimensions && typeof raw.dimensions === 'object');
  assert.ok(Array.isArray(raw.strengths));
  assert.ok(Array.isArray(raw.current_priorities));

  const anki = raw.anki_summary as Record<string, unknown> | undefined;
  assert.ok(anki, 'snapshot should include adaptive Anki summary');
  assert.equal(typeof anki.active_targets, 'number');
  assert.equal(typeof anki.high_priority_targets, 'number');
  assert.equal(typeof anki.retired_targets, 'number');
  assert.equal(typeof anki.local_sync_enabled, 'boolean');
  assert.ok(Array.isArray(anki.current_targets));

  const serialized = JSON.stringify(raw).toLowerCase();
  assert.equal(serialized.includes('raw_transcript'), false);
  assert.equal(serialized.includes('audio_blob'), false);
});
