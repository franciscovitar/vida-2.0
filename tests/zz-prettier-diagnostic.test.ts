import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { format, resolveConfig } from 'prettier';

const paths = [
  'components/professional/ProfessionalMarket.tsx',
  'components/professional/ProfessionalPanorama.tsx',
  'components/professional/ProfessionalTools.tsx',
  'components/professional/ProfessionalV2.module.scss',
  'data/generated/professional-market-detail.json',
  'tests/professional-v2.test.ts',
];

test('ZZ-PRETTIER-DIAGNOSTIC exact formatted outputs', async () => {
  for (const path of paths) {
    const input = readFileSync(path, 'utf8');
    const config = (await resolveConfig(path)) ?? {};
    const output = await format(input, { ...config, filepath: path });
    const encoded = Buffer.from(output, 'utf8').toString('base64');
    console.log(`PRETTIER-BASE64-BEGIN ${path}\n${encoded}\nPRETTIER-BASE64-END ${path}`);
  }

  assert.fail('diagnostic-only: remove after applying exact Prettier output');
});
