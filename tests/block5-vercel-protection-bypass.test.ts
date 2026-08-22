import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = JSON.parse(
  readFileSync(new URL('../automations/n8n/manual-ingress.json', import.meta.url), 'utf8'),
) as {
  nodes: Array<{
    name: string;
    type: string;
    parameters: {
      url?: unknown;
      body?: unknown;
      headerParameters?: { parameters?: Array<{ name?: unknown; value?: unknown }> };
    };
  }>;
};

test('block5 protected Preview: claim and callback use the Vercel automation bypass header without putting the secret in URL/body', () => {
  const protectedRequests = workflow.nodes.filter(
    (node) =>
      node.type === 'n8n-nodes-base.httpRequest' &&
      (node.name.startsWith('Claim ') || node.name.startsWith('Callback ')),
  );

  assert.equal(protectedRequests.length, 8);

  for (const node of protectedRequests) {
    const headers = node.parameters.headerParameters?.parameters ?? [];
    const bypassHeaders = headers.filter(
      (header) => header.name === 'x-vercel-protection-bypass',
    );

    assert.equal(bypassHeaders.length, 1, node.name);
    assert.equal(
      bypassHeaders[0]?.value,
      '={{ $env.VERCEL_AUTOMATION_BYPASS_SECRET }}',
      node.name,
    );
    assert.equal(String(node.parameters.url ?? '').includes('x-vercel-protection-bypass'), false);
    assert.equal(
      String(node.parameters.body ?? '').includes('VERCEL_AUTOMATION_BYPASS_SECRET'),
      false,
    );
  }
});
