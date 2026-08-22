import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

type ManualIngressTemplate = {
  nodes: Array<{
    name: string;
    parameters: Record<string, unknown>;
  }>;
};

test('block5 manual ingress: callbacks preserve the validated canonical runKey across subworkflow output', () => {
  const template = JSON.parse(
    readFileSync(path.join(process.cwd(), 'automations/n8n/manual-ingress.json'), 'utf8'),
  ) as ManualIngressTemplate;

  const supported = [
    'daily-briefing',
    'technical-watchdog',
    'weekly-review',
    'planning-suggestion',
  ] as const;

  for (const workflowKey of supported) {
    const build = template.nodes.find((node) => node.name === `Build ${workflowKey} callback`);
    assert.ok(build, workflowKey);

    const code = String(build.parameters.jsCode);
    assert.equal(
      code.includes(`$('Gate ${workflowKey} first delivery').first().json.runKey`),
      true,
      `${workflowKey}: callback must recover runKey from the validated pre-runner item`,
    );
    assert.equal(
      code.includes('const runKey = $json.runKey;'),
      false,
      `${workflowKey}: callback must not depend on the subworkflow returning runKey`,
    );
    assert.equal(
      code.includes("throw new Error('missing-canonical-run')"),
      true,
      `${workflowKey}: missing canonical runKey must remain fail-closed`,
    );
  }
});
