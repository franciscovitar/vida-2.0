import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const LIB_DIR = join(process.cwd(), 'lib');
const APP_DIR = join(process.cwd(), 'app');

function walkTs(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
    .map((entry) => join(dir, entry));
}

const FORBIDDEN = [
  /\.values\.append\b/,
  /\.values\.batchUpdate\b/,
  /\.values\.clear\b/,
  /\.batchUpdateValues\b/,
  /spreadsheets\.batchUpdate\b/,
  /\.batchClear\b/,
  /\/values:append\b/,
  /\/values:batchClear\b/,
  /\/values:clear\b/,
];

test('no existen operaciones append, insert, delete o clear en la capa de datos', () => {
  for (const file of [...walkTs(LIB_DIR), ...walkTs(APP_DIR)]) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      assert.equal(pattern.test(content), false, `Operación prohibida (${pattern}) en ${file}`);
    }
    assert.doesNotMatch(content, /\binsertDimension\b/);
    assert.doesNotMatch(content, /\bdeleteDimension\b/);
  }
});

test('la lectura usa scope readonly; la escritura usa spreadsheets', () => {
  const readImpl = readFileSync(join(LIB_DIR, 'google', 'sheets-read.ts'), 'utf8');
  const auth = readFileSync(join(LIB_DIR, 'google', 'auth.ts'), 'utf8');
  const writePort = readFileSync(join(LIB_DIR, 'habits', 'google-port.ts'), 'utf8');
  assert.match(readImpl, /READONLY_SCOPE|spreadsheets\.readonly/);
  assert.match(auth, /spreadsheets\.readonly/);
  assert.match(auth, /auth\/spreadsheets'/);
  assert.match(writePort, /SPREADSHEETS_SCOPE/);
  assert.match(writePort, /method: 'PUT'/);
  assert.doesNotMatch(writePort, /from ['"]googleapis['"]/);
});
