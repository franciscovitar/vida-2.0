import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { format } from 'prettier';

const files = [
  'app/(app)/world/pieza/[slug]/page.tsx',
  'app/(app)/world/tema/[domain]/page.tsx',
  'components/world/WorldPiece.tsx',
  'components/world/WorldSurface.tsx',
  'data/generated/world/pieces/crispr-localized-control-2026-10-03.json',
  'lib/world/contract.ts',
  'tests/world-intelligence.test.ts',
] as const;

test('WORLD-TEMP-CONFIG. dump repo-configured Prettier output', async () => {
  for (const file of files) {
    const formatted = await format(readFileSync(file, 'utf8'), {
      filepath: file,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'all',
      endOfLine: 'lf',
    });
    console.log(`@@WORLD_CONFIG_PRETTIER_START:${file}@@`);
    console.log(Buffer.from(formatted, 'utf8').toString('base64'));
    console.log(`@@WORLD_CONFIG_PRETTIER_END:${file}@@`);
  }
});
