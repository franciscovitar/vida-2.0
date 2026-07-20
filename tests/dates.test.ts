import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isFutureDate,
  parseSheetDate,
  startOfWeekMonday,
  todayInBuenosAires,
} from '@/lib/adapters/dates';

test('la fecha de hoy en Argentina no se desplaza por UTC', () => {
  // 01:00 UTC del 21 = 22:00 (AR, UTC-3) del 20.
  assert.equal(todayInBuenosAires(new Date('2026-07-21T01:00:00Z')), '2026-07-20');
  // 02:30 UTC del 20 = 23:30 (AR) del 19.
  assert.equal(todayInBuenosAires(new Date('2026-07-20T02:30:00Z')), '2026-07-19');
});

test('parseSheetDate acepta ISO, DD/MM/YYYY y número de serie', () => {
  assert.equal(parseSheetDate('2026-07-20'), '2026-07-20');
  assert.equal(parseSheetDate('20/07/2026'), '2026-07-20');
  assert.equal(parseSheetDate(45292), '2024-01-01');
  assert.equal(parseSheetDate(''), null);
  assert.equal(parseSheetDate('texto'), null);
});

test('isFutureDate distingue el futuro del presente', () => {
  assert.equal(isFutureDate('2026-07-21', '2026-07-20'), true);
  assert.equal(isFutureDate('2026-07-20', '2026-07-20'), false);
  assert.equal(isFutureDate('2026-07-19', '2026-07-20'), false);
});

test('startOfWeekMonday devuelve el lunes de la semana', () => {
  // 2026-07-20 es lunes.
  assert.equal(startOfWeekMonday('2026-07-20'), '2026-07-20');
  assert.equal(startOfWeekMonday('2026-07-22'), '2026-07-20');
  assert.equal(startOfWeekMonday('2026-07-26'), '2026-07-20');
});
