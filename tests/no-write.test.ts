import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const LIB_DIR = join(process.cwd(), 'lib');

function libFiles(): string[] {
  return (readdirSync(LIB_DIR, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(LIB_DIR, entry));
}

const FORBIDDEN = [
  /\.values\.update\b/,
  /\.values\.append\b/,
  /\.values\.batchUpdate\b/,
  /\.values\.clear\b/,
  /\.batchUpdateValues\b/,
  /spreadsheets\.batchUpdate\b/,
  /\.batchClear\b/,
];

test('la capa de datos no contiene ninguna operación de escritura', () => {
  for (const file of libFiles()) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      assert.equal(
        pattern.test(content),
        false,
        `Se encontró una operación de escritura (${pattern}) en ${file}`,
      );
    }
  }
});

test('el cliente de Google usa exclusivamente el scope de solo lectura', () => {
  const impl = readFileSync(join(LIB_DIR, 'google', 'sheets-read.ts'), 'utf8');
  assert.match(impl, /spreadsheets\.readonly/);
  assert.doesNotMatch(impl, /from ['"]googleapis['"]/);
  assert.doesNotMatch(impl, /auth\/spreadsheets(?!\.readonly)/);
});
