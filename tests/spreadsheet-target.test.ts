import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { getGoogleConfig } from '@/lib/data/config';
import {
  resolveSpreadsheetTarget,
  type SpreadsheetTargetEnv,
} from '@/lib/google/spreadsheet-target-core';
import { compareManualHabits } from '@/lib/habits/migration-compare';
import { toggleHabitWithPort } from '@/lib/habits/toggle';
import type { HabitSheetPort } from '@/lib/habits/sheet-port';
import { RD, REGISTRO_DIARIO_HEADERS, REGISTRO_DIARIO_TAB } from '@/lib/google/constants';
import {
  assertResolvedSpreadsheetId,
  DisallowedSpreadsheetError,
  isResolvedSpreadsheetId,
} from '@/lib/validation/spreadsheet-id';

const DEV_ID = 'test-dev-spreadsheet-id-aaaaaaaaaaaa';
const PROD_ID = 'test-prod-spreadsheet-id-bbbbbbbbbbbb';
const FAKE_KEY = '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n';
const FAKE_EMAIL = 'sa@example.test';

function baseEnv(overrides: SpreadsheetTargetEnv = {}): SpreadsheetTargetEnv {
  return {
    GOOGLE_SHEETS_DEV_ID: DEV_ID,
    GOOGLE_SHEETS_PROD_ID: PROD_ID,
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    ...overrides,
  };
}

function credEnv(overrides: SpreadsheetTargetEnv = {}): SpreadsheetTargetEnv {
  return {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: FAKE_EMAIL,
    GOOGLE_PRIVATE_KEY: FAKE_KEY,
    ...baseEnv(overrides),
  };
}

const TODAY = '2026-07-20';

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

function baseGrid(): unknown[][] {
  return [
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.firstAlarm]: false,
      [RD.bed]: true,
    }),
  ];
}

function createMemoryPort(initial: unknown[][]): HabitSheetPort & {
  writes: { range: string; value: boolean }[];
} {
  const grid: unknown[][] = initial.map((row) => [...row]);
  const writes: { range: string; value: boolean }[] = [];
  function parseRange(rangeA1: string): { col: number; row: number } {
    assert.match(rangeA1, new RegExp(`^${REGISTRO_DIARIO_TAB}![A-Z]+\\d+$`));
    const cell = rangeA1.split('!')[1];
    const match = /^([A-Z]+)(\d+)$/.exec(cell)!;
    let col = 0;
    for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { col: col - 1, row: Number.parseInt(match[2], 10) - 1 };
  }
  return {
    writes,
    async readRegistroDiario() {
      return { ok: true, values: grid.map((row) => [...row]) };
    },
    async readCell(rangeA1) {
      const { col, row } = parseRange(rangeA1);
      return { ok: true, value: grid[row]?.[col] ?? null };
    },
    async writeCell(rangeA1, value) {
      const { col, row } = parseRange(rangeA1);
      grid[row][col] = value;
      writes.push({ range: rangeA1, value });
      return { ok: true };
    },
  };
}

function input(
  partial: { habitName?: string; nextValue?: boolean; expectedPreviousValue?: boolean } = {},
) {
  return {
    targetDate: TODAY,
    habitName: partial.habitName ?? RD.firstAlarm,
    nextValue: partial.nextValue ?? true,
    expectedPreviousValue: partial.expectedPreviousValue ?? false,
    operationId: 'op-target',
  };
}

const HEADER = [
  RD.fecha,
  RD.firstAlarm,
  RD.bed,
  RD.shower,
  RD.posture,
  RD.gym,
  RD.cardio,
  RD.stretch,
  RD.mealPrep,
  RD.journaling,
  RD.football,
];

// --- RESOLUCIÓN 1–12 ---

test('1. target dev resuelve DEV', () => {
  const r = resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: 'dev' }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.target, 'dev');
  assert.equal(r.spreadsheetId, DEV_ID);
  assert.equal(r.writesAllowed, true);
});

test('2. target prod resuelve producción', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'true',
    }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.target, 'prod');
  assert.equal(r.spreadsheetId, PROD_ID);
});

test('3. target ausente resuelve dev por compatibilidad temporal', () => {
  const r = resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: undefined }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.target, 'dev');
  assert.equal(r.spreadsheetId, DEV_ID);
});

test('4. target ausente nunca resuelve producción', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: '',
      GOOGLE_SHEETS_DEV_ID: DEV_ID,
      GOOGLE_SHEETS_PROD_ID: PROD_ID,
      VERCEL_ENV: 'production',
    }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.target, 'dev');
  assert.notEqual(r.spreadsheetId, PROD_ID);
});

test('5. target inválido falla cerrado', () => {
  const r = resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: 'staging' }));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'invalid-target');
  assert.doesNotMatch(JSON.stringify(r), new RegExp(DEV_ID));
});

test('6. DEV ID ausente falla con target dev', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({ GOOGLE_SHEETS_TARGET: 'dev', GOOGLE_SHEETS_DEV_ID: '' }),
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'missing-id');
});

test('7. PROD ID ausente falla con target prod', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      GOOGLE_SHEETS_PROD_ID: '',
      VERCEL_ENV: 'production',
    }),
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'missing-id');
});

test('8. Preview + target prod falla cerrado', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({ GOOGLE_SHEETS_TARGET: 'prod', VERCEL_ENV: 'preview' }),
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'prod-forbidden-in-env');
});

test('9. Preview + target dev funciona', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({ GOOGLE_SHEETS_TARGET: 'dev', VERCEL_ENV: 'preview' }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.target, 'dev');
});

test('10. Production + target prod permite lectura', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.target, 'prod');
  assert.equal(r.writesAllowed, false);
});

test('11. Production + target dev utiliza DEV sin tocar producción', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({ GOOGLE_SHEETS_TARGET: 'dev', VERCEL_ENV: 'production' }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.spreadsheetId, DEV_ID);
  assert.notEqual(r.spreadsheetId, PROD_ID);
});

test('12. Entorno ambiguo no habilita producción', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: undefined,
      // NODE_ENV no se consulta a propósito
    }),
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'prod-forbidden-in-env');
});

// --- ESCRITURA 13–30 ---

test('13–14. DEV permite escritura con sesión lógica; allow prod no requerido', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: 'dev' }));
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  const result = await toggleHabitWithPort(input(), port, { today: TODAY, resolved });
  assert.equal(result.ok, true);
  assert.equal(port.writes.length, 1);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(DEV_ID));
});

test('15. Prod con allow ausente rechaza', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: undefined,
    }),
  );
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.writesAllowed, false);
  const result = await toggleHabitWithPort(input(), port, { today: TODAY, resolved });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'unauthorized-spreadsheet');
  assert.equal(port.writes.length, 0);
});

test('16. Prod con allow=false rechaza', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    }),
  );
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  const result = await toggleHabitWithPort(input(), port, { today: TODAY, resolved });
  assert.equal(result.ok, false);
  assert.equal(port.writes.length, 0);
});

test('17. Prod con allow=true permite llegar al puerto', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'true',
    }),
  );
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.writesAllowed, true);
  const result = await toggleHabitWithPort(input(), port, { today: TODAY, resolved });
  assert.equal(result.ok, true);
  assert.equal(port.writes.length, 1);
});

test('18. Prod fuera de VERCEL_ENV=production rechaza', () => {
  const r = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'development',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'true',
    }),
  );
  assert.equal(r.ok, false);
});

test('19. Preview jamás escribe prod', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(
    baseEnv({ GOOGLE_SHEETS_TARGET: 'prod', VERCEL_ENV: 'preview' }),
  );
  assert.equal(resolved.ok, false);
  // Sin resolved válido no hay escritura.
  assert.equal(port.writes.length, 0);
});

test('20. Escritura rechazada no invoca PUT (writes=0)', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    }),
  );
  assert.ok(resolved.ok);
  if (!resolved.ok) return;
  await toggleHabitWithPort(input(), port, { today: TODAY, resolved });
  assert.equal(port.writes.length, 0);
});

test('21–22. Cliente/Action no eligen spreadsheetId', () => {
  const action = readFileSync(join(process.cwd(), 'app/actions/habits.ts'), 'utf8');
  assert.doesNotMatch(action, /spreadsheetId/);
  assert.match(action, /toggleHabitWithPort/);
  const board = readFileSync(join(process.cwd(), 'components/habits/HabitsBoard.tsx'), 'utf8');
  assert.doesNotMatch(board, /GOOGLE_SHEETS_|spreadsheetId/);
});

test('23. Sesión ausente: Action exige verifySession', () => {
  const action = readFileSync(join(process.cwd(), 'app/actions/habits.ts'), 'utf8');
  assert.match(action, /verifySession/);
});

test('24. Hábito fuera de whitelist rechaza', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: 'dev' }));
  assert.ok(resolved.ok);
  if (!resolved.ok) return;
  const result = await toggleHabitWithPort(input({ habitName: 'Pasos' }), port, {
    today: TODAY,
    resolved,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'unauthorized-column');
  assert.equal(port.writes.length, 0);
});

test('25–26. Rango múltiple rechazado; una sola celda', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: 'dev' }));
  assert.ok(resolved.ok);
  if (!resolved.ok) return;
  const result = await toggleHabitWithPort(input(), port, { today: TODAY, resolved });
  assert.equal(result.ok, true);
  assert.equal(port.writes.length, 1);
  assert.doesNotMatch(port.writes[0].range, /:/);
});

test('27–29. Read-before-write, verify y verify fail', async () => {
  const toggleSrc = readFileSync(join(process.cwd(), 'lib/habits/toggle.ts'), 'utf8');
  assert.match(toggleSrc, /readCell/);
  assert.match(toggleSrc, /writeCell/);
  assert.match(toggleSrc, /verification-failed/);
  assert.match(toggleSrc, /expectedPreviousValue/);

  let phase = 0;
  const flaky: HabitSheetPort = {
    async readRegistroDiario() {
      return { ok: true, values: baseGrid() };
    },
    async readCell() {
      phase += 1;
      // before: false; after: sigue false (verify fail)
      return { ok: true, value: false };
    },
    async writeCell() {
      return { ok: true };
    },
  };
  const resolved = resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: 'dev' }));
  assert.ok(resolved.ok);
  if (!resolved.ok) return;
  const result = await toggleHabitWithPort(input(), flaky, { today: TODAY, resolved });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'verification-failed');
  assert.ok(phase >= 2);
});

test('30. Toggle y revert mantienen el mismo Sheet (mismo resolved)', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: 'dev' }));
  assert.ok(resolved.ok);
  if (!resolved.ok) return;
  const a = await toggleHabitWithPort(
    input({ nextValue: true, expectedPreviousValue: false }),
    port,
    {
      today: TODAY,
      resolved,
    },
  );
  assert.equal(a.ok, true);
  const b = await toggleHabitWithPort(
    input({ nextValue: false, expectedPreviousValue: true }),
    port,
    {
      today: TODAY,
      resolved,
    },
  );
  assert.equal(b.ok, true);
  assert.equal(port.writes.length, 2);
  assert.equal(port.writes[0].range, port.writes[1].range);
});

// --- LECTURA / AISLAMIENTO 31–42 ---

test('31–33. Lectura y escritura mismo target; sin fallback cruzado', () => {
  const cfg = getGoogleConfig(credEnv({ GOOGLE_SHEETS_TARGET: 'dev' }));
  assert.equal(cfg.ok, true);
  if (!cfg.ok) return;
  assert.equal(cfg.config.target, 'dev');
  assert.equal(cfg.config.spreadsheetId, DEV_ID);

  const prod = getGoogleConfig(
    credEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
    }),
  );
  assert.equal(prod.ok, true);
  if (!prod.ok) return;
  assert.equal(prod.config.spreadsheetId, PROD_ID);
  assert.notEqual(prod.config.spreadsheetId, DEV_ID);

  const core = readFileSync(join(process.cwd(), 'lib/google/spreadsheet-target-core.ts'), 'utf8');
  assert.doesNotMatch(core, /fallback.*(dev|prod)|(prod|dev).*fallback/i);
});

test('34. DATA_SOURCE=mock sigue siendo el default de getDataSource', async () => {
  const { getDataSource } = await import('@/lib/data/config');
  const original = process.env.DATA_SOURCE;
  try {
    delete process.env.DATA_SOURCE;
    assert.equal(getDataSource(), 'mock');
  } finally {
    if (original === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = original;
  }
});

test('35. Config google inválida no expone IDs', () => {
  const r = getGoogleConfig(credEnv({ GOOGLE_SHEETS_TARGET: 'prod', VERCEL_ENV: 'preview' }));
  assert.equal(r.ok, false);
  assert.doesNotMatch(JSON.stringify(r), new RegExp(DEV_ID));
  assert.doesNotMatch(JSON.stringify(r), new RegExp(PROD_ID));
  assert.doesNotMatch(JSON.stringify(r), /ejemplo|PRIVATE KEY/i);
});

test('36–37. DTO de fallo serializable', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    }),
  );
  assert.ok(resolved.ok);
  if (!resolved.ok) return;
  const result = await toggleHabitWithPort(input(), port, { today: TODAY, resolved });
  assert.equal(typeof structuredClone(result), 'object');
  assert.equal(JSON.parse(JSON.stringify(result)).ok, false);
});

test('38. googleapis/auth no llegan al cliente de hábitos', () => {
  const board = readFileSync(join(process.cwd(), 'components/habits/HabitsBoard.tsx'), 'utf8');
  assert.doesNotMatch(board, /googleapis|spreadsheet-target|GOOGLE_PRIVATE/);
  const targetServer = readFileSync(
    join(process.cwd(), 'lib/google/spreadsheet-target.ts'),
    'utf8',
  );
  assert.match(targetServer, /server-only/);
});

test('39–42. Notion, Calendar, AW, Health Auto Export intactos en target', () => {
  const core = readFileSync(join(process.cwd(), 'lib/google/spreadsheet-target-core.ts'), 'utf8');
  assert.doesNotMatch(core, /notion|calendar|ActivityWatch|Huawei|Health Auto Export/i);
});

// --- MIGRACIÓN 43–48 ---

test('43–48. Comparador: plan vacío, conserva prod true, no copia false, excluye futuro', () => {
  const result = compareManualHabits({
    todayYmd: '2026-07-20',
    authorizedHabits: [RD.firstAlarm, RD.bed],
    devValues: [
      HEADER,
      ['2026-07-15', true, false, false, false, false, false, false, false, false, false],
      ['2026-08-01', true, false, false, false, false, false, false, false, false, false],
    ],
    prodValues: [
      HEADER,
      ['2026-07-15', true, true, false, false, false, false, false, false, false, false],
      ['2026-08-01', false, false, false, false, false, false, false, false, false, false],
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.totals.candidates, 0);
  assert.equal(result.totals.equalTrue, 1);
  assert.equal(result.totals.preserveProdTrue, 1);
  assert.equal(result.proposesCopyingFalse, false);
  assert.ok(result.candidates.every((c) => c.expectedValue === true));
  assert.doesNotMatch(JSON.stringify(result), /Pasos|ActivityWatch/);
});

// --- PREVIEW / PRODUCCIÓN 49–54 ---

test('49. .env.example distingue entornos y no hardcodea IDs reales', () => {
  const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  assert.match(example, /GOOGLE_SHEETS_TARGET=dev/);
  assert.match(example, /GOOGLE_SHEETS_DEV_ID=ejemplo_dev/);
  assert.match(example, /GOOGLE_SHEETS_PROD_ID=ejemplo_prod/);
  assert.match(example, /GOOGLE_SHEETS_ALLOW_PROD_WRITES=false/);
  assert.doesNotMatch(example, /1TBrEQuoc/);
  assert.match(example, /Preview/);
  assert.match(example, /Production/);
});

test('50–51. Preview bloquea prod; production no escribe sin allow', () => {
  assert.equal(
    resolveSpreadsheetTarget(baseEnv({ GOOGLE_SHEETS_TARGET: 'prod', VERCEL_ENV: 'preview' })).ok,
    false,
  );
  const r = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.writesAllowed, false);
});

test('52. Ningún ID queda hardcodeado en validation', () => {
  const src = readFileSync(join(process.cwd(), 'lib/validation/spreadsheet-id.ts'), 'utf8');
  assert.doesNotMatch(src, /ALLOWED_SPREADSHEET_ID/);
  assert.doesNotMatch(src, /1[A-Za-z0-9_-]{20,}/);
  assert.match(src, /isResolvedSpreadsheetId|assertResolvedSpreadsheetId/);
});

test('53. Ningún ID hardcodeado en config/target', () => {
  const config = readFileSync(join(process.cwd(), 'lib/data/config.ts'), 'utf8');
  const core = readFileSync(join(process.cwd(), 'lib/google/spreadsheet-target-core.ts'), 'utf8');
  assert.doesNotMatch(config, /1TBrEQuoc|ALLOWED_SPREADSHEET/);
  assert.doesNotMatch(core, /1TBrEQuoc|ALLOWED_SPREADSHEET/);
  assert.match(config, /resolveSpreadsheetTarget/);
});

test('54. Errores de usuario no muestran target ni ID', async () => {
  const port = createMemoryPort(baseGrid());
  const resolved = resolveSpreadsheetTarget(
    baseEnv({
      GOOGLE_SHEETS_TARGET: 'prod',
      VERCEL_ENV: 'production',
      GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    }),
  );
  assert.ok(resolved.ok);
  if (!resolved.ok) return;
  const result = await toggleHabitWithPort(input(), port, { today: TODAY, resolved });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.doesNotMatch(result.message, /prod|dev|TARGET|spreadsheetId|test-prod|test-dev/i);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(PROD_ID));
});

test('assertResolvedSpreadsheetId compara contra ID resuelto', () => {
  assert.equal(isResolvedSpreadsheetId(DEV_ID, DEV_ID), true);
  assert.equal(isResolvedSpreadsheetId(PROD_ID, DEV_ID), false);
  assert.throws(() => assertResolvedSpreadsheetId(PROD_ID, DEV_ID), DisallowedSpreadsheetError);
});
