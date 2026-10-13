import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  attemptPlanningV2DevAppendOnce,
  resolvePlanningV2DevSendTarget,
} from '@/lib/daily-planning/google-append-once-v2';

const DAY = '2026-10-11';
const AT = '2026-10-11T09:30:00-03:00';
const EX = '5f3a8424a73a20ff8ed51f69aa00a29b935c6d65752763a767a2f97e9cc2458d';
const OR = '2a6a51a9e4a9feed2a347b96705e28963bb71a4302d942f62858601dca89c686';
const AS = '5afb1e6d497f2f29cce28787eb7b8d00a581bc0a50b92b7101de4c85defd23b4';
const execution: unknown[] = [
  'vida2:tasks-daily-planning:v2:execution:' + EX,
  DAY,
  AT,
  'study',
  'university',
  'subject',
  'subject-iop',
  'Práctica inventarios',
  75,
  '',
  'partial',
  'DECLARED',
  'unknown',
  'user_report',
  'Media',
  '[]',
  'planning-execution-v2',
];
const orientationPayload = {
  review: { date: DAY, headline: 'Prueba', items: [], uncertainties: [] },
  attention: [],
  upcoming: [],
  lifeSignals: [],
  minimum: [],
  notNow: [],
};
const orientation: unknown[] = [
  'vida2:tasks-daily-planning:v2:orientation:' + DAY + ':' + OR,
  DAY,
  AT,
  JSON.stringify(orientationPayload),
  'chatgpt_project',
  'daily-orientation-v2',
];
const assessmentPayload = {
  name: 'Parcial 2',
  type: 'written-exam',
  status: 'planned',
  progressPercent: null,
  progressConfidence: 'low',
  readinessBand: 'unknown',
  remainingMinutesLow: null,
  remainingMinutesHigh: null,
  etaConfidence: 'low',
  criticalGaps: [],
  nextBestActivity: null,
  scopeComplete: false,
  evidenceCount: 0,
};
const assessment: unknown[] = [
  'vida2:assessment-progress:v1:' + AS,
  'exam-id',
  'iop',
  '',
  AT,
  JSON.stringify(assessmentPayload),
  'chatgpt_subject_project',
  'assessment-progress-v1',
];
const rows = { execution, orientation, assessment };
type Kind = keyof typeof rows;
const DEV = {
  PLANNING_V2_DEV_GOOGLE_APPEND_ENABLED: 'true',
  PLANNING_V2_DEV_FIRESTORE_LEDGER_ENABLED: 'true',
  PLANNING_V2_DEV_LEDGER_ENABLED: 'false',
  VERCEL_GIT_COMMIT_REF: 'vida-qa',
  DATA_SOURCE: 'google',
  GOOGLE_SHEETS_TARGET: 'dev',
  GOOGLE_SHEETS_DEV_ID: 'mock-dev-workbook-id-for-isolated-tests',
  GOOGLE_SHEETS_PROD_ID: 'separate-prod-workbook-id-for-tests',
  VERCEL_ENV: 'preview',
  PLANNING_V2_DEV_EXECUTION_SHEET_ID: '101',
  PLANNING_V2_DEV_ORIENTATION_SHEET_ID: '102',
  PLANNING_V2_DEV_ASSESSMENT_SHEET_ID: '103',
};
const liveHeaders = {
  execution: [
    'Observation ID',
    'Fecha',
    'Registrado en',
    'Activity Type',
    'Domain',
    'Entity Type',
    'Canonical Ref',
    'Actividad',
    'Minutos declarados',
    'Inicio real',
    'Execution State',
    'Evidence State',
    'Progress Effect',
    'Source Class',
    'Confianza',
    'Evidence Refs JSON',
    'Version',
  ],
  orientation: ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'],
  assessment: [
    'Snapshot ID',
    'Assessment ID',
    'Subject ID',
    'Fecha evaluación',
    'Generado en',
    'Payload JSON',
    'Fuente',
    'Versión',
  ],
} as const;
const liveTitles = {
  execution: 'Planning Execution V2',
  orientation: 'Daily Planning',
  assessment: 'Assessment Progress',
} as const;
type MockOptions = {
  response?: number;
  transportError?: boolean;
  token?: string | null;
  tokenError?: boolean;
  metadataError?: boolean;
  metadataTransportError?: boolean;
  metadataWorkbook?: string;
  metadataTabId?: number;
  metadataTabTitle?: string;
  metadataColumns?: number;
  metadataHeaders?: readonly unknown[];
  headerError?: boolean;
  headerTransportError?: boolean;
  headerExtraRows?: boolean;
};
function mock(
  kind: Kind = 'execution',
  overrides: Record<string, string | undefined> = {},
  opts: MockOptions = {},
) {
  let tokenCalls = 0,
    requests = 0,
    reads = 0,
    requestUrl = '',
    init: RequestInit | undefined;
  const env = { ...DEV, ...overrides };
  const token = async () => {
    tokenCalls++;
    if (opts.tokenError) throw Error('synthetic token error');
    return opts.token === undefined ? 'dummy-test-token' : opts.token;
  };
  const fetchImpl = (async (url: string | URL | Request, options?: RequestInit) => {
    const address = String(url);
    if (options?.method === 'GET') {
      reads++;
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      assert.equal(
        options.headers && (options.headers as Record<string, string>).Authorization,
        'Bearer dummy-test-token',
      );
      if (address.includes('/values/')) {
        if (opts.headerTransportError) throw Error('synthetic header timeout');
        if (opts.headerError) return new Response(null, { status: 403 });
        const values = [opts.metadataHeaders ?? [...liveHeaders[kind]]];
        if (opts.headerExtraRows) values.push(['unexpected-data']);
        return Response.json({ values });
      }
      if (opts.metadataTransportError) throw Error('synthetic metadata timeout');
      if (opts.metadataError) return new Response(null, { status: 403 });
      if (!address.includes('fields=')) throw Error('metadata must be projected');
      return Response.json({
        spreadsheetId: opts.metadataWorkbook ?? env.GOOGLE_SHEETS_DEV_ID,
        sheets: [
          {
            properties: {
              sheetId:
                opts.metadataTabId ??
                Number(
                  env[('PLANNING_V2_DEV_' + kind.toUpperCase() + '_SHEET_ID') as keyof typeof env],
                ),
              title: opts.metadataTabTitle ?? liveTitles[kind],
              gridProperties: { columnCount: opts.metadataColumns ?? liveHeaders[kind].length },
            },
          },
        ],
      });
    }
    requests++;
    requestUrl = address;
    init = options;
    if (opts.transportError) throw Error('synthetic lost Google reply');
    return new Response(null, { status: opts.response ?? 200 });
  }) as typeof fetch;
  const run = (row: readonly unknown[] = rows[kind]) =>
    attemptPlanningV2DevAppendOnce({
      kind,
      row,
      env,
      token,
      fetchImpl,
    });
  return {
    run,
    env,
    get tokenCalls() {
      return tokenCalls;
    },
    get requests() {
      return requests;
    },
    get reads() {
      return reads;
    },
    get url() {
      return requestUrl;
    },
    get init() {
      return init;
    },
  };
}

test('feature flag OFF blocks before token or POST', async () => {
  const m = mock('execution', { PLANNING_V2_DEV_GOOGLE_APPEND_ENABLED: undefined });
  assert.deepEqual(await m.run(), { status: 'blocked', postAttempts: 0, retryAllowed: false });
  assert.equal(m.tokenCalls, 0);
  assert.equal(m.requests, 0);
});
test('Firestore ledger flag OFF blocks before token or POST', async () => {
  const m = mock('execution', { PLANNING_V2_DEV_FIRESTORE_LEDGER_ENABLED: 'false' });
  assert.equal((await m.run()).status, 'blocked');
  assert.equal(m.tokenCalls, 0);
  assert.equal(m.requests, 0);
});
test('legacy Redis-only flag never activates the Firestore transport', async () => {
  const m = mock('execution', {
    PLANNING_V2_DEV_LEDGER_ENABLED: 'true',
    PLANNING_V2_DEV_FIRESTORE_LEDGER_ENABLED: undefined,
  });
  assert.equal((await m.run()).status, 'blocked');
  assert.equal(m.tokenCalls, 0);
  assert.equal(m.requests, 0);
});
test('simultaneous Redis and Firestore flags are an ambiguous writer and fail closed', async () => {
  const m = mock('execution', { PLANNING_V2_DEV_LEDGER_ENABLED: 'true' });
  assert.equal((await m.run()).status, 'blocked');
  assert.equal(m.requests, 0);
});
test('generic Preview and non-vida-qa branches cannot resolve a send target', async () => {
  for (const ref of [undefined, 'main', 'another-branch', 'vida-qa-temp', '']) {
    const m = mock('execution', { VERCEL_GIT_COMMIT_REF: ref });
    assert.equal((await m.run()).status, 'blocked');
    assert.equal(m.tokenCalls, 0);
    assert.equal(m.requests, 0);
  }
});
test('non-google data source cannot mutate Google', async () => {
  const m = mock('execution', { DATA_SOURCE: 'mock' });
  assert.equal((await m.run()).status, 'blocked');
  assert.equal(m.requests, 0);
});
test('explicit DEV is required; never use implicit fallback or PROD', async () => {
  for (const target of [undefined, 'prod', 'DEV', '']) {
    const m = mock('execution', { GOOGLE_SHEETS_TARGET: target });
    assert.equal((await m.run()).status, 'blocked');
    assert.equal(m.requests, 0);
  }
});
test('production, unknown or missing deployment environment is always blocked', async () => {
  for (const value of ['production', 'development', undefined, 'local', 'test']) {
    const m = mock('execution', { VERCEL_ENV: value });
    assert.equal((await m.run()).status, 'blocked');
    assert.equal(m.requests, 0);
  }
});
test('DEV and PROD workbook identity must both be known and distinct', async () => {
  for (const id of [undefined, 'mock-dev-workbook-id-for-isolated-tests']) {
    const m = mock('execution', { GOOGLE_SHEETS_PROD_ID: id });
    assert.equal((await m.run()).status, 'blocked');
    assert.equal(m.requests, 0);
  }
});
test('missing, malformed, negative and oversized tab IDs cannot send', async () => {
  for (const id of [undefined, '', '-1', '1.5', '02', String(2 ** 31), 'x']) {
    const m = mock('execution', { PLANNING_V2_DEV_EXECUTION_SHEET_ID: id });
    assert.equal((await m.run()).status, 'blocked');
    assert.equal(m.requests, 0);
  }
});
test('unknown kind cannot resolve a tab or fetch', () => {
  assert.equal(resolvePlanningV2DevSendTarget('unknown' as Kind, DEV), null);
});
test('valid DEV target points to the exact keyed tab and workbook', () => {
  for (const [kind, id] of [
    ['execution', 101],
    ['orientation', 102],
    ['assessment', 103],
  ] as const) {
    assert.deepEqual(resolvePlanningV2DevSendTarget(kind, DEV), {
      workbookId: DEV.GOOGLE_SHEETS_DEV_ID,
      sheetId: id,
      kind,
    });
  }
});
test('wrong candidate hash fails closed BEFORE token request', async () => {
  const m = mock();
  const forged = [...execution];
  forged[8] = 76;
  assert.equal((await m.run(forged)).status, 'blocked');
  assert.equal(m.tokenCalls, 0);
  assert.equal(m.requests, 0);
});
test('three canonical V2 formats send exactly one typed POST and stay unconfirmed', async () => {
  for (const kind of ['execution', 'orientation', 'assessment'] as const) {
    const m = mock(kind);
    const result = await m.run();
    assert.deepEqual(result, {
      status: 'submitted-unconfirmed',
      postAttempts: 1,
      retryAllowed: false,
    });
    assert.equal(m.tokenCalls, 1);
    assert.equal(m.requests, 1);
    assert.equal(m.reads, 2, 'metadata and exact header must be checked before POST');
    assert.match(m.url, /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[^?]+:batchUpdate$/);
    assert.equal(m.init?.method, 'POST');
    assert.equal(m.init?.cache, 'no-store');
    assert.equal(m.init?.redirect, 'error');
    assert.equal(
      m.init?.headers && (m.init.headers as Record<string, string>).Authorization,
      'Bearer dummy-test-token',
    );
    assert.equal(m.init?.signal instanceof AbortSignal, true);
    const request = JSON.parse(String(m.init?.body));
    assert.equal(request.requests.length, 1);
    assert.equal(request.includeSpreadsheetInResponse, false);
    const op = request.requests[0].appendCells;
    assert.equal(
      op.sheetId,
      Number(DEV[('PLANNING_V2_DEV_' + kind.toUpperCase() + '_SHEET_ID') as keyof typeof DEV]),
    );
    assert.equal(op.rows.length, 1);
    assert.equal(op.rows[0].values.length, rows[kind].length);
    assert.equal(op.rows[0].values[0].userEnteredValue.stringValue, rows[kind][0]);
  }
});

test('wrong workbook metadata never sends a POST, even with valid env', async () => {
  const m = mock('execution', {}, { metadataWorkbook: 'wrong-workbook' });
  assert.deepEqual(await m.run(), { status: 'not-sent', postAttempts: 0, retryAllowed: false });
  assert.equal(m.reads, 1);
  assert.equal(m.requests, 0);
});
test('wrong numeric DEV tab id or tab title cannot send', async () => {
  for (const opts of [{ metadataTabId: 900 }, { metadataTabTitle: 'Daily Planning' }]) {
    const m = mock('execution', {}, opts);
    assert.equal((await m.run()).status, 'not-sent');
    assert.equal(m.requests, 0);
    assert.equal(m.reads, 1);
  }
});
test('undersized DEV tab and schema drift fail closed', async () => {
  for (const opts of [
    { metadataColumns: 16 },
    { metadataHeaders: [...liveHeaders.execution].reverse() },
    { metadataHeaders: liveHeaders.execution.slice(0, 16) },
    { metadataHeaders: [...liveHeaders.execution, 'Extra'] },
  ]) {
    const m = mock('execution', {}, opts);
    const status = (await m.run()).status;
    assert.equal(status, 'not-sent');
    assert.equal(m.requests, 0);
  }
});
test('metadata and header auth failures or timeouts never attempt POST', async () => {
  for (const opts of [
    { metadataError: true },
    { metadataTransportError: true },
    { headerError: true },
    { headerTransportError: true },
    { headerExtraRows: true },
  ]) {
    const m = mock('execution', {}, opts);
    assert.deepEqual(await m.run(), { status: 'not-sent', postAttempts: 0, retryAllowed: false });
    assert.equal(m.requests, 0);
    assert.ok(m.reads >= 1 && m.reads <= 2);
  }
});
test('read-only preflight never uses POST before both metadata reads pass', async () => {
  for (const kind of ['execution', 'orientation', 'assessment'] as const) {
    const m = mock(kind);
    const res = await m.run();
    assert.equal(res.postAttempts, 1);
    assert.equal(m.reads, 2);
    assert.equal(m.requests, 1);
  }
});

test('403/429/500 responses are uncertain; no hidden retry', async () => {
  for (const code of [401, 403, 429, 500, 503]) {
    const m = mock('execution', {}, { response: code });
    assert.deepEqual(await m.run(), {
      status: 'outcome-uncertain',
      postAttempts: 1,
      retryAllowed: false,
    });
    assert.equal(m.requests, 1);
  }
});
test('transport exception after fetch invocation stays uncertain and never retries', async () => {
  const m = mock('execution', {}, { transportError: true });
  assert.deepEqual(await m.run(), {
    status: 'outcome-uncertain',
    postAttempts: 1,
    retryAllowed: false,
  });
  assert.equal(m.requests, 1);
});
test('token failure BEFORE the POST is safely not-sent', async () => {
  for (const opts of [
    { token: null },
    { token: '' },
    { token: 'token with whitespace' },
    { tokenError: true },
  ]) {
    const m = mock('execution', {}, opts);
    assert.deepEqual(await m.run(), { status: 'not-sent', postAttempts: 0, retryAllowed: false });
    assert.equal(m.requests, 0);
  }
});
test('result never exposes token, candidate ID, row text or provider data', async () => {
  const m = mock();
  const output = JSON.stringify(await m.run());
  for (const value of ['dummy-test-token', EX, 'Práctica inventarios', DEV.GOOGLE_SHEETS_DEV_ID]) {
    assert.equal(output.includes(value), false);
  }
});
test('no default real credentials and no network path is created by target lookup', () => {
  assert.equal(resolvePlanningV2DevSendTarget('execution', {}), null);
});
