import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  INTELLIGENCE_FEEDBACK_HEADERS,
  INTELLIGENCE_FEEDBACK_TAB,
  INTELLIGENCE_FEEDBACK_VERSION,
  intelligenceFeedbackToRow,
  parseIntelligenceFeedbackRow,
  type IntelligenceFeedbackCell,
  type IntelligenceFeedbackRecord,
  type IntelligenceFeedbackSheetPort,
  upsertIntelligenceFeedbackWithPort,
} from '@/lib/intelligence/feedback';
import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';

const ARTICLE_ID = 'INT-TEC-2026-09-21-02';
const DEV_ID = 'synthetic-dev-spreadsheet-aaaaaaaa';
const PROD_ID = 'synthetic-prod-spreadsheet-bbbbbbbb';

function resolvedDev() {
  const result = resolveSpreadsheetTarget({
    GOOGLE_SHEETS_TARGET: 'dev',
    GOOGLE_SHEETS_DEV_ID: DEV_ID,
    GOOGLE_SHEETS_PROD_ID: PROD_ID,
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    VERCEL_ENV: 'preview',
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('synthetic DEV target did not resolve');
  return result;
}

function record(overrides: Partial<IntelligenceFeedbackRecord> = {}): IntelligenceFeedbackRecord {
  return {
    articleId: ARTICLE_ID,
    feedback: 'USEFUL',
    updatedAt: '2026-09-21T17:00:00.000Z',
    version: INTELLIGENCE_FEEDBACK_VERSION,
    ...overrides,
  };
}

function createMemoryPort(initial: IntelligenceFeedbackCell[][]): IntelligenceFeedbackSheetPort & {
  writes: { range: string; values: IntelligenceFeedbackCell[] }[];
  grid: IntelligenceFeedbackCell[][];
} {
  const grid = initial.map((row) => [...row]);
  const writes: { range: string; values: IntelligenceFeedbackCell[] }[] = [];

  return {
    grid,
    writes,
    async readAll() {
      return { ok: true, values: grid.map((row) => [...row]) };
    },
    async writeRow(rangeA1, values) {
      const match = /^'Intelligence Feedback'!A(\d+):D\1$/.exec(rangeA1);
      assert.ok(match);
      const rowIndex = Number(match[1]) - 1;
      while (grid.length <= rowIndex) grid.push([]);
      grid[rowIndex] = [...values];
      writes.push({ range: rangeA1, values: [...values] });
      return { ok: true };
    },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    articleId: ARTICLE_ID,
    feedback: 'USEFUL',
    operationId: 'synthetic-op',
    ...overrides,
  } as Parameters<typeof upsertIntelligenceFeedbackWithPort>[0];
}

test('IF1. contrato de feedback tiene sólo cuatro columnas y seis valores cerrados', () => {
  assert.equal(INTELLIGENCE_FEEDBACK_TAB, 'Intelligence Feedback');
  assert.deepEqual(INTELLIGENCE_FEEDBACK_HEADERS, [
    'Article ID',
    'Feedback',
    'Updated At',
    'Feedback Version',
  ]);

  for (const value of [
    'USEFUL',
    'ALREADY_KNEW',
    'TOO_BASIC',
    'TOO_DETAILED',
    'NOT_RELEVANT',
    'WANT_DEEPER',
  ]) {
    const parsed = parseIntelligenceFeedbackRow(
      intelligenceFeedbackToRow(record({ feedback: value as IntelligenceFeedbackRecord['feedback'] })),
    );
    assert.ok(parsed);
    assert.equal(parsed.feedback, value);
  }
});

test('IF2. valor desconocido falla cerrado sin escribir', async () => {
  const port = createMemoryPort([[...INTELLIGENCE_FEEDBACK_HEADERS]]);
  const result = await upsertIntelligenceFeedbackWithPort(
    input({ feedback: 'LIKE' }),
    port,
    { resolved: resolvedDev() },
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'invalid-value');
  assert.equal(port.writes.length, 0);
});

test('IF3. retry idéntico es idempotente y no vuelve a escribir', async () => {
  const existing = record();
  const port = createMemoryPort([
    [...INTELLIGENCE_FEEDBACK_HEADERS],
    intelligenceFeedbackToRow(existing),
  ]);

  const result = await upsertIntelligenceFeedbackWithPort(input(), port, {
    resolved: resolvedDev(),
    now: new Date('2026-09-21T18:00:00.000Z'),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.replay, true);
  assert.equal(result.corrected, false);
  assert.equal(result.record.updatedAt, existing.updatedAt);
  assert.equal(port.writes.length, 0);
});

test('IF4. cambiar respuesta corrige la misma fila', async () => {
  const port = createMemoryPort([
    [...INTELLIGENCE_FEEDBACK_HEADERS],
    intelligenceFeedbackToRow(record()),
  ]);

  const result = await upsertIntelligenceFeedbackWithPort(
    input({ feedback: 'WANT_DEEPER' }),
    port,
    {
      resolved: resolvedDev(),
      now: new Date('2026-09-21T18:00:00.000Z'),
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.corrected, true);
  assert.equal(result.rowNumber, 2);
  assert.equal(result.record.feedback, 'WANT_DEEPER');
  assert.equal(port.writes.length, 1);
  assert.equal(port.writes[0].range, "'Intelligence Feedback'!A2:D2");
  assert.equal(port.grid.length, 2);
});

test('IF5. artículo duplicado falla cerrado', async () => {
  const row = intelligenceFeedbackToRow(record());
  const port = createMemoryPort([[...INTELLIGENCE_FEEDBACK_HEADERS], row, [...row]]);

  const result = await upsertIntelligenceFeedbackWithPort(
    input({ feedback: 'NOT_RELEVANT' }),
    port,
    { resolved: resolvedDev() },
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'duplicate-article');
  assert.equal(port.writes.length, 0);
});

test('IF6. Production exige target resuelto y flag de escritura', async () => {
  const prod = resolveSpreadsheetTarget({
    GOOGLE_SHEETS_TARGET: 'prod',
    GOOGLE_SHEETS_DEV_ID: DEV_ID,
    GOOGLE_SHEETS_PROD_ID: PROD_ID,
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'true',
    VERCEL_ENV: 'production',
  });
  assert.equal(prod.ok, true);
  if (!prod.ok) return;

  const port = createMemoryPort([[...INTELLIGENCE_FEEDBACK_HEADERS]]);
  const result = await upsertIntelligenceFeedbackWithPort(input(), port, {
    resolved: prod,
  });

  assert.equal(result.ok, true);
  assert.equal(port.writes.length, 1);
});

test('IF7. acción exige sesión, usa PUT verificado y UI no admite texto libre', () => {
  const action = readFileSync(
    join(process.cwd(), 'app/actions/intelligence-feedback.ts'),
    'utf8',
  );
  const port = readFileSync(
    join(process.cwd(), 'lib/intelligence/feedback-sheet.ts'),
    'utf8',
  );
  const component = readFileSync(
    join(process.cwd(), 'components/intelligence/IntelligenceFeedback.tsx'),
    'utf8',
  );
  const page = readFileSync(
    join(process.cwd(), 'app/(app)/inteligencia/[front]/[slug]/page.tsx'),
    'utf8',
  );

  assert.match(action, /verifySession/);
  assert.match(action, /upsertIntelligenceFeedbackWithPort/);
  assert.match(port, /method: 'PUT'/);
  assert.doesNotMatch(port, /values:append|insertDimension|deleteDimension|batchClear/i);
  assert.match(component, /Me sirvió/);
  assert.match(component, /Ya lo sabía/);
  assert.match(component, /Muy básico/);
  assert.match(component, /Muy detallado/);
  assert.match(component, /No me interesa/);
  assert.match(component, /Quiero profundizar/);
  assert.doesNotMatch(component, /textarea|contentEditable/i);
  assert.match(page, /loadIntelligenceFeedbackSnapshot/);
});
