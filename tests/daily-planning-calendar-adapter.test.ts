import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adaptDailyPlanningCalendarEvent } from '@/lib/calendar/planning-adapters';

const TZ = 'America/Argentina/Cordoba';

test('DP-C1. all-day es marcador de fecha y no bloque de capacidad', () => {
  const event = adaptDailyPlanningCalendarEvent(
    {
      id: 'exam',
      summary: 'Parcial – Redes',
      status: 'confirmed',
      transparency: 'transparent',
      start: { date: '2026-09-14' },
      end: { date: '2026-09-15' },
    },
    'primary',
    TZ,
    'Principal',
  );

  assert.ok(event);
  assert.equal(event.planningRole, 'date-marker');
  assert.equal(event.allDay, true);
  assert.equal(event.durationMinutes, null);
});

test('DP-C2. timed opaque consume capacidad; timed transparent es informativo', () => {
  const opaque = adaptDailyPlanningCalendarEvent(
    {
      id: 'meeting',
      summary: 'Reunión',
      status: 'confirmed',
      transparency: 'opaque',
      start: { dateTime: '2026-09-05T15:00:00-03:00' },
      end: { dateTime: '2026-09-05T16:00:00-03:00' },
    },
    'primary',
    TZ,
    'Principal',
  );
  const transparent = adaptDailyPlanningCalendarEvent(
    {
      id: 'marker',
      summary: 'Recordatorio con hora',
      status: 'confirmed',
      transparency: 'transparent',
      start: { dateTime: '2026-09-05T17:00:00-03:00' },
      end: { dateTime: '2026-09-05T17:30:00-03:00' },
    },
    'primary',
    TZ,
    'Principal',
  );

  assert.equal(opaque?.planningRole, 'capacity-block');
  assert.equal(transparent?.planningRole, 'informational');
});

test('DP-C3. contradicción DAO se conserva como quality evidence, no se corrige', () => {
  const event = adaptDailyPlanningCalendarEvent(
    {
      id: 'dao',
      summary: 'Parcial – DAO',
      description: 'Materia: DAO Fecha confirmada por vos: 21/09.',
      status: 'confirmed',
      transparency: 'transparent',
      start: { date: '2026-09-25' },
      end: { date: '2026-09-26' },
    },
    'primary',
    TZ,
    'Principal',
  );

  assert.ok(event);
  assert.equal(event.evidence.provenance, 'user-confirmed');
  assert.equal(event.evidence.describedDate, '2026-09-21');
  assert.equal(event.evidence.dateConflict, true);
  assert.equal(event.startDate, '2026-09-25');
});

test('DP-C4. cronograma y fuente oficial se distinguen sin inventar confianza', () => {
  const schedule = adaptDailyPlanningCalendarEvent(
    {
      id: 'cdd',
      summary: 'CDD – Entrega',
      description: 'Fecha tomada del cronograma que compartiste.',
      start: { date: '2026-09-11' },
      end: { date: '2026-09-12' },
    },
    'primary',
    TZ,
    'Principal',
  );
  const official = adaptDailyPlanningCalendarEvent(
    {
      id: 'iop',
      summary: '3.er TP – IOP',
      description: 'Materia: IOP Confianza: Figura en UV.',
      start: { date: '2026-09-15' },
      end: { date: '2026-09-16' },
    },
    'primary',
    TZ,
    'Principal',
  );

  assert.equal(schedule?.evidence.provenance, 'schedule-derived');
  assert.equal(official?.evidence.provenance, 'official-source');
});
