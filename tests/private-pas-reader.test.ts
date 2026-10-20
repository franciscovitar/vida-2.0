import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  createPrivatePasReader,
  isAllowedPasDirectoryPath,
  isAllowedPasJsonPath,
} from '@/lib/private-pas/github-reader';

const SHA = 'a'.repeat(40);

test('private PAS reader pins all allowlisted reads to one main commit', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/git/ref/heads/main')) {
      return Response.json({ object: { sha: SHA } });
    }
    return Response.json({
      content: Buffer.from(JSON.stringify({ fixture: true })).toString('base64'),
      encoding: 'base64',
    });
  };
  const reader = createPrivatePasReader({ token: 'synthetic-token', fetchImpl });
  const [commit, value] = await Promise.all([
    reader.sourceCommit(),
    reader.readJson('AI/projects/university/subjects/iop/state/current.json'),
  ]);

  assert.equal(commit, SHA);
  assert.deepEqual(value, { fixture: true });
  assert.equal(calls.length, 2);
  assert.match(calls[1]?.url ?? '', new RegExp(`ref=${SHA}`));
  assert.ok(calls.every((call) => call.init?.cache === 'no-store'));
  assert.ok(
    calls.every(
      (call) =>
        (call.init?.headers as Record<string, string>).Authorization === 'Bearer synthetic-token',
    ),
  );
});

test('private PAS reader refuses non-allowlisted paths before making requests', async () => {
  let called = false;
  const reader = createPrivatePasReader({
    token: 'synthetic-token',
    fetchImpl: async () => {
      called = true;
      return Response.json({});
    },
  });

  await assert.rejects(
    reader.readJson('AI/knowledge/personal/private-not-allowed.json'),
    /not-allowed/,
  );
  await assert.rejects(reader.listLearningFiles('AI/projects/university/subjects'), /not-allowed/);
  assert.equal(called, false);
  assert.equal(
    isAllowedPasJsonPath('AI/projects/university/subjects/tpa/state/current.json'),
    true,
  );
  assert.equal(
    isAllowedPasJsonPath('AI/projects/university/subjects/other/state/current.json'),
    false,
  );
  assert.equal(isAllowedPasDirectoryPath('AI/projects/university/subjects/tpa/learning'), true);
  assert.equal(
    isAllowedPasDirectoryPath('AI/projects/university/subjects/tpa/learning/assessments'),
    false,
  );
});

test('private PAS reader returns generic errors without exposing server credentials', async () => {
  const secret = 'synthetic-secret-do-not-leak';
  const reader = createPrivatePasReader({
    token: secret,
    fetchImpl: async () => new Response('failure', { status: 500 }),
  });
  await assert.rejects(reader.sourceCommit(), (error: Error) => {
    assert.equal(error.message, 'private-pas-read-failed');
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test('academic source has no public snapshot fallback or static copy of learner state', () => {
  const snapshotPath = join(process.cwd(), 'data/generated/university-study-catalog.json');
  const source = readFileSync(join(process.cwd(), 'lib/study-engine/catalog-source.ts'), 'utf8');
  assert.equal(existsSync(snapshotPath), false);
  assert.doesNotMatch(source, /fallbackSnapshot|university-study-catalog\.json/);
});
