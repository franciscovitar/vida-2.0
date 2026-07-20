import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { compareTotals, clampPercent } from '@/lib/adapters/compare';
import { addDaysYmd, todayInBuenosAires } from '@/lib/adapters/dates';
import {
  buildHabitsPageData,
  habitAvailableDays,
  habitEvaluablePastDays,
  resolveHabitDayState,
} from '@/lib/adapters/habits-period';
import {
  buildProductivityPageData,
  productivityAvailableDays,
  productivityHasData,
} from '@/lib/adapters/productivity-period';
import { parseRegistroDiario, registroHasData } from '@/lib/adapters/registro-diario';
import { buildHealthPageData, saludAvailableDays } from '@/lib/adapters/salud-period';
import { parseSalud, saludHasData } from '@/lib/adapters/salud';
import { RD, REGISTRO_DIARIO_HEADERS, SAL, SALUD_HEADERS } from '@/lib/google/constants';
import { HABIT_ACTIVATION_DATES, habitsMissingActivation } from '@/lib/habits/activation';
import { AUTHORIZED_HABIT_NAMES } from '@/lib/habits/authorized';
import { buildMockDomainRecords } from '@/lib/mock-data/domain-history';
import { periodWindow, previousPeriodWindow, parsePeriodParam } from '@/lib/periods';
import { ALLOWED_SPREADSHEET_ID, isAllowedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

const TODAY = '2026-07-20';

test('1. availableDays es independiente por dominio', () => {
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-18',
      [RD.work]: 10,
      [RD.gym]: false,
    }),
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-19',
      [RD.gym]: true,
    }),
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.faculty]: 0,
    }),
  ]);
  const salud = parseSalud([
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, { [SAL.fecha]: '2026-07-19', [SAL.steps]: 100 }),
    rowFor(SALUD_HEADERS, { [SAL.fecha]: TODAY, [SAL.importStatus]: 'parcial' }),
  ]);
  const window = periodWindow(TODAY, 7);
  // Hábitos: días pasados civiles desde activación (no registroHasData).
  assert.equal(habitAvailableDays(registro, window, TODAY).length, 6);
  assert.equal(productivityAvailableDays(registro, window).length, 2); // 18 y 20
  assert.equal(saludAvailableDays(salud, window).length, 2);
});

test('2. cero no se transforma en vacío', () => {
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.leisure]: 0,
      [RD.faculty]: 0,
    }),
  ])[0];
  assert.equal(registro.leisure.kind, 'value');
  assert.equal(registro.leisure.value, 0);
  assert.equal(productivityHasData(registro), true);
  const page = buildProductivityPageData({
    records: [registro],
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const leisure = page.categories.find((c) => c.id === 'leisure');
  assert.equal(leisure?.totalLabel, '0 min');
  assert.equal(page.history[0]?.leisure, '0 min');
});

test('3. false de hoy es pending y no entra al denominador', () => {
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.work]: 30,
      [RD.gym]: false,
      [RD.firstAlarm]: false,
    }),
  ]);
  const window = periodWindow(TODAY, 7);
  const page = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window,
    todayHabits: [],
    todayWeekly: [],
    rowExists: true,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const alarm = page.dailyHabits.find((h) => h.id === RD.firstAlarm);
  assert.ok(alarm);
  // Solo días pasados desde activación (hoy false no penaliza).
  assert.equal(alarm.completed, 0);
  assert.equal(alarm.available, 6);
  const day = page.calendar.find((d) => d.date === TODAY);
  assert.equal(day?.cells[RD.gym], 'pending');
  assert.equal(day?.cells[RD.firstAlarm], 'pending');
});

test('4. filas futuras se ignoran', () => {
  const future = addDaysYmd(TODAY, 2);
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, { [RD.fecha]: TODAY, [RD.work]: 10 }),
    rowFor(REGISTRO_DIARIO_HEADERS, { [RD.fecha]: future, [RD.gym]: true, [RD.work]: 99 }),
  ]);
  const window = periodWindow(TODAY, 7);
  assert.equal(productivityAvailableDays(registro, window).length, 1);
  const page = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window,
    todayHabits: [],
    todayWeekly: [],
    rowExists: true,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  // La ventana termina en hoy: el futuro no entra al calendario ni al rate.
  assert.equal(
    page.calendar.some((d) => d.date === future),
    false,
  );
  assert.equal(
    resolveHabitDayState({
      date: future,
      today: TODAY,
      activatedOn: '2026-07-12',
      value: true,
    }),
    'unavailable',
  );
  const gymWeek = page.weeklyGoals.find((g) => g.id === 'goal-gym');
  assert.equal(gymWeek?.currentWeek, 0);
});

test('5. promedios excluyen días sin datos', () => {
  const salud = parseSalud([
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, { [SAL.fecha]: '2026-07-18', [SAL.sleep]: 8 }),
    rowFor(SALUD_HEADERS, { [SAL.fecha]: '2026-07-19' }), // vacío → no cuenta
    rowFor(SALUD_HEADERS, { [SAL.fecha]: TODAY, [SAL.sleep]: 6 }),
  ]);
  assert.equal(saludHasData(salud[1]), false);
  const page = buildHealthPageData({
    records: salud,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const sleep = page.metrics.find((m) => m.id === 'sleep');
  assert.equal(page.availableDays, 2);
  assert.equal(sleep?.average, 7);
});

test('6. comparación 7 vs. 7 anterior', () => {
  const current = periodWindow(TODAY, 7);
  const prev = previousPeriodWindow(current);
  assert.equal(current.days, 7);
  assert.equal(prev.days, 7);
  assert.equal(addDaysYmd(prev.end, 1), current.start);
});

test('7. comparación con período anterior cero no produce infinito', () => {
  const cmp = compareTotals(40, 0);
  assert.equal(cmp.available, false);
  assert.equal(cmp.label, 'Sin comparación');
  assert.doesNotMatch(cmp.label, /∞|Infinity|NaN/i);
});

test('8. metas semanales 3/3/3/1/2', () => {
  const mock = buildMockDomainRecords(TODAY);
  const page = buildHabitsPageData({
    records: mock.registro,
    today: TODAY,
    window: periodWindow(TODAY, 30),
    todayHabits: [],
    todayWeekly: [],
    rowExists: true,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const targets = Object.fromEntries(page.weeklyGoals.map((g) => [g.id, g.target]));
  assert.deepEqual(targets, {
    'goal-gym': 3,
    'goal-cardio': 3,
    'goal-stretch': 3,
    'goal-mealprep': 1,
    'goal-football': 2,
  });
});

test('9. porcentaje visual no supera 100 %', () => {
  assert.equal(clampPercent(5, 3), 100);
  assert.equal(clampPercent(1, 3), 33);
  assert.equal(clampPercent(0, 3), 0);
});

test('10. salud parcial se identifica correctamente', () => {
  const salud = parseSalud([
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: TODAY,
      [SAL.importStatus]: 'parcial',
      [SAL.steps]: 10,
    }),
  ]);
  const page = buildHealthPageData({
    records: salud,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'ready',
    notice: null,
  });
  assert.equal(page.today.kind, 'partial');
  assert.match(page.today.label, /parcial/i);
});

test('11. fechas no se desplazan por UTC', () => {
  assert.equal(todayInBuenosAires(new Date('2026-07-21T01:00:00Z')), '2026-07-20');
  assert.equal(todayInBuenosAires(new Date('2026-07-20T02:30:00Z')), '2026-07-19');
  assert.equal(addDaysYmd('2026-07-20', -1), '2026-07-19');
  assert.equal(parsePeriodParam('30'), 30);
  assert.equal(parsePeriodParam('nope'), 7);
});

test('12. escritura sigue limitada a los diez hábitos', () => {
  const auth = readFileSync(join(process.cwd(), 'lib', 'habits', 'authorized.ts'), 'utf8');
  assert.match(auth, /Primera alarma/);
  assert.match(auth, /Fútbol/);
  const toggle = readFileSync(join(process.cwd(), 'lib', 'habits', 'toggle.ts'), 'utf8');
  assert.match(toggle, /isAuthorizedHabitName/);
});

test('13. producción sigue rechazada', () => {
  assert.equal(isAllowedSpreadsheetId(ALLOWED_SPREADSHEET_ID), true);
  assert.equal(isAllowedSpreadsheetId('1ProductionXXXXXXXX'), false);
});

test('14. modo mock funciona sin credenciales', () => {
  const mock = buildMockDomainRecords(TODAY);
  assert.ok(mock.registro.length > 10);
  assert.ok(mock.salud.length > 5);
  assert.ok(mock.registro.some((r) => r.date && registroHasData(r)));
  const page = buildProductivityPageData({
    records: mock.registro,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  assert.equal(page.source, 'mock');
  assert.ok(page.availableDays >= 1);
});

test('15. páginas de dominio no fuerzan scroll horizontal de layout', () => {
  const files = [
    'components/domain/DomainPage.module.scss',
    'components/domain/HabitMatrix.module.scss',
    'app/page.module.scss',
  ].map((rel) => readFileSync(join(process.cwd(), rel), 'utf8'));
  assert.ok(files.some((css) => css.includes('overflow-x: auto')));
  assert.ok(files.every((css) => !css.includes('overflow-x: scroll')));
  // Contenedores de página usan min-width: 0 / column flex.
  assert.match(files[2], /min-width:\s*0/);
});

test('no hay operaciones de escritura estructurales nuevas', () => {
  const lib = join(process.cwd(), 'lib');
  const files = (readdirSync(lib, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(lib, entry));
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /values:append|batchClear|insertDimension|deleteDimension/);
  }
});

// --- Disponibilidad estadística de hábitos (auditoría Fase 3A) ---

test('H1. día pasado con todos false y sin métricas cuenta como disponible', () => {
  const past = '2026-07-19';
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: past,
      [RD.firstAlarm]: false,
      [RD.bed]: false,
      [RD.shower]: false,
      [RD.posture]: false,
      [RD.gym]: false,
      [RD.cardio]: false,
      [RD.stretch]: false,
      [RD.mealPrep]: false,
      [RD.journaling]: false,
      [RD.football]: false,
    }),
  ]);
  assert.equal(registroHasData(registro[0]), false);
  const window = periodWindow(TODAY, 7);
  const page = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window,
    todayHabits: [],
    todayWeekly: [],
    rowExists: false,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const alarm = page.dailyHabits.find((h) => h.id === RD.firstAlarm);
  assert.ok(alarm);
  assert.ok(alarm.available >= 1);
  assert.equal(page.calendar.find((d) => d.date === past)?.cells[RD.firstAlarm], 'missed');
});

test('H2. false pasado cuenta como incumplido', () => {
  assert.equal(
    resolveHabitDayState({
      date: '2026-07-19',
      today: TODAY,
      activatedOn: '2026-07-12',
      value: false,
    }),
    'missed',
  );
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-19',
      [RD.firstAlarm]: false,
    }),
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-18',
      [RD.firstAlarm]: true,
    }),
  ]);
  const page = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    todayHabits: [],
    todayWeekly: [],
    rowExists: false,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const alarm = page.dailyHabits.find((h) => h.id === RD.firstAlarm);
  assert.ok(alarm);
  assert.equal(alarm.completed, 1);
  assert.equal(alarm.available, 6);
  assert.equal(alarm.rate, 1 / 6);
});

test('H3. false de hoy aparece pending y no penaliza el porcentaje', () => {
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-19',
      [RD.firstAlarm]: true,
    }),
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.firstAlarm]: false,
    }),
  ]);
  const page = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    todayHabits: [],
    todayWeekly: [],
    rowExists: true,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const alarm = page.dailyHabits.find((h) => h.id === RD.firstAlarm);
  assert.ok(alarm);
  assert.equal(page.calendar.find((d) => d.date === TODAY)?.cells[RD.firstAlarm], 'pending');
  assert.equal(alarm.completed, 1);
  assert.equal(alarm.available, 6);
  assert.equal(alarm.rate, 1 / 6);
});

test('H4. true de hoy sí se incorpora', () => {
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-19',
      [RD.firstAlarm]: true,
    }),
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.firstAlarm]: true,
    }),
  ]);
  const page = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    todayHabits: [],
    todayWeekly: [],
    rowExists: true,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const alarm = page.dailyHabits.find((h) => h.id === RD.firstAlarm);
  assert.ok(alarm);
  assert.equal(page.calendar.find((d) => d.date === TODAY)?.cells[RD.firstAlarm], 'done');
  assert.equal(alarm.completed, 2);
  assert.equal(alarm.available, 7);
  assert.equal(alarm.rate, 2 / 7);
});

test('H5. fecha anterior a la activación aparece unavailable', () => {
  assert.equal(
    resolveHabitDayState({
      date: '2026-07-10',
      today: TODAY,
      activatedOn: '2026-07-12',
      value: true,
    }),
    'unavailable',
  );
  // Tender la cama activa el 17: el 16 debe ser unavailable aunque haya false.
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-16',
      [RD.bed]: false,
      [RD.firstAlarm]: true,
    }),
  ]);
  const page = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window: periodWindow(TODAY, 7),
    todayHabits: [],
    todayWeekly: [],
    rowExists: false,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  assert.equal(page.calendar.find((d) => d.date === '2026-07-16')?.cells[RD.bed], 'unavailable');
  assert.equal(page.calendar.find((d) => d.date === '2026-07-16')?.cells[RD.firstAlarm], 'done');
});

test('H6. fecha futura aparece unavailable', () => {
  const future = addDaysYmd(TODAY, 1);
  assert.equal(
    resolveHabitDayState({
      date: future,
      today: TODAY,
      activatedOn: '2026-07-12',
      value: true,
    }),
    'unavailable',
  );
});

test('H7. cada hábito puede tener fecha de activación diferente', () => {
  assert.equal(HABIT_ACTIVATION_DATES[RD.firstAlarm], '2026-07-12');
  assert.equal(HABIT_ACTIVATION_DATES[RD.bed], '2026-07-17');
  assert.equal(HABIT_ACTIVATION_DATES[RD.shower], '2026-07-17');
  assert.notEqual(HABIT_ACTIVATION_DATES[RD.firstAlarm], HABIT_ACTIVATION_DATES[RD.bed]);
  assert.deepEqual(habitsMissingActivation(AUTHORIZED_HABIT_NAMES), []);

  const window = periodWindow(TODAY, 7);
  // Activación 12 → 6 días pasados en ventana 14–19.
  assert.equal(habitEvaluablePastDays(window, TODAY, '2026-07-12').length, 6);
  // Activación 17 → solo 17, 18, 19.
  assert.equal(habitEvaluablePastDays(window, TODAY, '2026-07-17').length, 3);

  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-18',
      [RD.firstAlarm]: true,
      [RD.bed]: true,
    }),
  ]);
  const page = buildHabitsPageData({
    records: registro,
    today: TODAY,
    window,
    todayHabits: [],
    todayWeekly: [],
    rowExists: false,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const alarm = page.dailyHabits.find((h) => h.id === RD.firstAlarm);
  const bed = page.dailyHabits.find((h) => h.id === RD.bed);
  assert.ok(alarm && bed);
  assert.equal(alarm.available, 6);
  assert.equal(bed.available, 3);
});

test('H8. metas semanales siguen funcionando por semana', () => {
  // Semana del lunes 2026-07-20: gym true el lunes y martes; domingo 19 es otra semana.
  const registro = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, { [RD.fecha]: '2026-07-20', [RD.gym]: true }),
    rowFor(REGISTRO_DIARIO_HEADERS, { [RD.fecha]: '2026-07-21', [RD.gym]: true }),
    rowFor(REGISTRO_DIARIO_HEADERS, { [RD.fecha]: '2026-07-19', [RD.gym]: true }),
  ]);
  const page = buildHabitsPageData({
    records: registro,
    today: '2026-07-21',
    window: periodWindow('2026-07-21', 30),
    todayHabits: [],
    todayWeekly: [],
    rowExists: true,
    writable: false,
    source: 'mock',
    status: 'mock',
    notice: null,
  });
  const gym = page.weeklyGoals.find((g) => g.id === 'goal-gym');
  assert.ok(gym);
  assert.equal(gym.target, 3);
  // currentWeek = lunes 20 + martes 21 (domingo 19 es otra semana).
  assert.equal(gym.currentWeek, 2);
  assert.equal(gym.percent, 67);
  assert.ok(gym.weeklySeries.length >= 1);
});

test('H9. escritura segura de hábitos no cambia', () => {
  const toggle = readFileSync(join(process.cwd(), 'lib', 'habits', 'toggle.ts'), 'utf8');
  const locate = readFileSync(join(process.cwd(), 'lib', 'habits', 'sheet-locate.ts'), 'utf8');
  const auth = readFileSync(join(process.cwd(), 'lib', 'habits', 'authorized.ts'), 'utf8');
  assert.match(toggle, /isAuthorizedHabitName/);
  assert.match(toggle, /isAllowedSpreadsheetId/);
  assert.match(locate, /findHabitColumn/);
  assert.match(locate, /habitCellRange/);
  assert.match(auth, /AUTHORIZED_HABIT_NAMES/);
  // Activation module no toca escritura.
  const activation = readFileSync(join(process.cwd(), 'lib', 'habits', 'activation.ts'), 'utf8');
  assert.doesNotMatch(activation, /values\.update|toggleHabit|spreadsheets\.values/i);
});
