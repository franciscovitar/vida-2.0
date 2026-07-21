import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSheetToday } from '@/lib/adapters/sheet';
import { parseRegistroDiario, registroHasData } from '@/lib/adapters/registro-diario';
import { parseSalud, saludHasData } from '@/lib/adapters/salud';
import { isMissingHeaderCode } from '@/lib/google/errors';
import { RD, REGISTRO_DIARIO_HEADERS, SAL, SALUD_HEADERS } from '@/lib/google/constants';
import { integrationSidebarLabel } from '@/lib/data/integration-label';

function rowFor(headers: readonly string[], values: Record<string, unknown>): unknown[] {
  return headers.map((header) => (header in values ? values[header] : ''));
}

const TODAY = '2026-07-20';

function registroValues(): unknown[][] {
  return [
    [...REGISTRO_DIARIO_HEADERS],
    // Día anterior con datos (gimnasio en false).
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-19',
      [RD.sleep]: 7,
      [RD.energy]: 3,
      [RD.gym]: false,
      [RD.journaling]: true,
    }),
    // Hoy con datos: trabajo con minutos, ocio en 0 (cero), journaling en false.
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.sleep]: 8,
      [RD.energy]: 5,
      [RD.work]: 120,
      [RD.faculty]: 60,
      [RD.vida2]: 30,
      [RD.leisure]: 0,
      [RD.pcActive]: 300,
      [RD.gym]: true,
      [RD.journaling]: false,
      [RD.bed]: true,
    }),
    // Fila futura precreada: no debe contar como día disponible.
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-25',
      [RD.energy]: 1,
      [RD.gym]: true,
    }),
  ];
}

function saludValues(): unknown[][] {
  return [
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: TODAY,
      [SAL.sleep]: 8,
      [SAL.deepSleep]: 0, // cero conservado
      [SAL.restingHr]: 55,
      [SAL.steps]: 0, // cero conservado
    }),
  ];
}

test('modo google: compone datos reales y marca el estado ready', () => {
  const { data, hasData } = buildSheetToday(registroValues(), saludValues(), TODAY);

  assert.equal(hasData, true);
  assert.equal(data.status, 'ready');
  assert.equal(data.source, 'google');
  assert.equal(data.targetDate, TODAY);
  assert.equal(data.registroDate, TODAY);
  assert.equal(data.healthDate, TODAY);
});

test('el cero se muestra como 0, no como "Sin datos"', () => {
  const { data } = buildSheetToday(registroValues(), saludValues(), TODAY);

  const leisure = data.productivity.rows.find((row) => row.id === 'leisure');
  assert.equal(leisure?.value, '0 min');
  assert.equal(data.health.deepSleep.value, '0 min');
  assert.equal(data.health.steps.value, '0');
});

test('el false se conserva: hábito en false queda como pendiente', () => {
  const { data } = buildSheetToday(registroValues(), saludValues(), TODAY);

  const gym = data.habits.find((habit) => habit.id === RD.gym);
  const journaling = data.habits.find((habit) => habit.id === RD.journaling);
  const posture = data.habits.find((habit) => habit.id === RD.posture);

  assert.equal(gym?.status, 'done');
  assert.equal(journaling?.status, 'pending');
  assert.equal(posture?.status, 'pending'); // vacío en fila existente → editable como pending
});

test('las filas futuras no cuentan como días reales', () => {
  const { data } = buildSheetToday(registroValues(), saludValues(), TODAY);

  assert.equal(data.summary.energy.value, '5/5');
  const gymGoal = data.weekly.find((goal) => goal.id === 'goal-gym');
  assert.equal(gymGoal?.current, 1);
});

test('sin días disponibles: estado no-data y métricas "Sin datos"', () => {
  const { data, hasData } = buildSheetToday(
    [[...REGISTRO_DIARIO_HEADERS]],
    [[...SALUD_HEADERS]],
    TODAY,
  );

  assert.equal(hasData, false);
  assert.equal(data.status, 'no-data');
  assert.equal(data.targetDate, TODAY);
  assert.equal(data.registroDate, null);
  assert.equal(data.healthDate, null);
  assert.equal(data.health.sleep.value, 'Sin datos');
  assert.equal(data.summary.energy.value, 'Sin datos');
});

test('un encabezado faltante genera un código plano (no una instancia de Error)', () => {
  const brokenHeaders = REGISTRO_DIARIO_HEADERS.filter((h) => h !== RD.energy);
  assert.throws(
    () => parseRegistroDiario([[...brokenHeaders]]),
    (error: unknown) => isMissingHeaderCode(error) && error.missing.includes(RD.energy),
  );

  const brokenSalud = SALUD_HEADERS.filter((h) => h !== SAL.steps);
  assert.throws(
    () => parseSalud([[...brokenSalud]]),
    (error: unknown) => isMissingHeaderCode(error) && error.missing.includes(SAL.steps),
  );
});

test('Hoy usa solo la fecha objetivo: no sustituye silenciosamente un día anterior', () => {
  const registro = [
    [...REGISTRO_DIARIO_HEADERS],
    // 18 con muchos datos (antes se elegía por "último disponible").
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: '2026-07-18',
      [RD.energy]: 4,
      [RD.work]: 200,
      [RD.faculty]: 0,
      [RD.leisure]: 22,
      [RD.pcActive]: 145,
      [RD.gym]: false,
    }),
    // 20 con ActivityWatch (incluido facultad 0).
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.work]: 3,
      [RD.faculty]: 0,
      [RD.leisure]: 10,
      [RD.pcActive]: 50,
      [RD.gym]: false,
      [RD.journaling]: false,
    }),
  ];
  const salud = [
    [...SALUD_HEADERS],
    // Salud solo el 18: no debe aparecer como salud de hoy.
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: '2026-07-18',
      [SAL.steps]: 952,
      [SAL.sleep]: 7.5,
      [SAL.restingHr]: 54,
    }),
  ];

  const { data } = buildSheetToday(registro, salud, TODAY);

  assert.equal(data.targetDate, TODAY);
  assert.equal(data.registroDate, TODAY);
  assert.equal(data.healthDate, null);
  assert.equal(data.summary.work.value, '3 min');
  assert.equal(data.summary.faculty.value, '0 min');
  assert.notEqual(data.summary.work.value, '3 h 20 min');
  assert.equal(data.health.steps.value, 'Sin datos');
  assert.equal(data.health.steps.context, 'sin registro');
  assert.match(data.notice ?? '', /Salud de hoy sin datos/i);

  // Hábitos del 20 (false → pending), no del 18.
  const gym = data.habits.find((habit) => habit.id === RD.gym);
  assert.equal(gym?.status, 'pending');
});

test('false solos no convierten una fila en día real; un 0 sí', () => {
  const onlyFalse = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.gym]: false,
      [RD.journaling]: false,
    }),
  ])[0];
  assert.equal(registroHasData(onlyFalse), false);

  const withZero = parseRegistroDiario([
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.faculty]: 0,
      [RD.gym]: false,
    }),
  ])[0];
  assert.equal(registroHasData(withZero), true);
});

test('importación parcial cuenta como dato de salud del día, sin traer el día anterior', () => {
  const registro = [
    [...REGISTRO_DIARIO_HEADERS],
    rowFor(REGISTRO_DIARIO_HEADERS, {
      [RD.fecha]: TODAY,
      [RD.faculty]: 0,
    }),
  ];
  const salud = [
    [...SALUD_HEADERS],
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: '2026-07-18',
      [SAL.steps]: 9000,
    }),
    rowFor(SALUD_HEADERS, {
      [SAL.fecha]: TODAY,
      [SAL.importStatus]: 'parcial',
      [SAL.steps]: 100,
    }),
  ];

  const todaySalud = parseSalud(salud).find((r) => r.date === TODAY)!;
  assert.equal(saludHasData(todaySalud), true);

  const { data } = buildSheetToday(registro, salud, TODAY);
  assert.equal(data.healthDate, TODAY);
  assert.equal(data.health.steps.value, '100');
  assert.notEqual(data.health.steps.value, '9.000');
  assert.match(data.notice ?? '', /parcial/i);
});

test('etiqueta del sidebar refleja el estado real', () => {
  assert.equal(integrationSidebarLabel('mock', 'mock'), 'Datos simulados');
  assert.equal(integrationSidebarLabel('google', 'ready'), 'Google Sheets');
  assert.equal(integrationSidebarLabel('google', 'no-data'), 'Google Sheets');
  assert.equal(integrationSidebarLabel('google', 'not-configured'), 'Sin conexión');
  assert.equal(integrationSidebarLabel('google', 'auth-error'), 'Integración parcial');
});
