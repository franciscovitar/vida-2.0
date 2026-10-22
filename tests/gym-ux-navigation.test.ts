import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { GYM_V4_DAYS, GYM_V4_DAY_SETS, GYM_V4_WEEKLY_SETS } from '@/lib/gym/routine-v4-proposal';

function source(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), 'utf8');
}

test('Gym UX separa Resumen, Rutina, Progreso y Cardio en rutas estables', () => {
  const navigation = source('components/gym/GymNavigation.tsx');
  assert.match(navigation, /Resumen/);
  assert.match(navigation, /\/gimnasio\/rutina/);
  assert.match(navigation, /\/gimnasio\/progreso/);
  assert.match(navigation, /\/gimnasio\/cardio/);

  assert.match(source('app/(app)/gimnasio/page.tsx'), /current="summary"/);
  assert.match(source('app/(app)/gimnasio/rutina/page.tsx'), /current="routine"/);
  assert.match(source('app/(app)/gimnasio/progreso/page.tsx'), /current="progress"/);
  assert.match(source('app/(app)/gimnasio/cardio/page.tsx'), /current="cardio"/);
});

test('Gym Resumen usa una superficie corta y separa el dashboard de progreso', () => {
  const page = source('app/(app)/gimnasio/page.tsx');
  const dashboard = source('components/gym/GymDashboard.tsx');

  assert.match(page, /GymDashboardView/);
  assert.match(dashboard, /GymSummaryOverview/);
  assert.match(dashboard, /GymProgressDashboardView/);
  assert.match(dashboard, /GymCardioDashboardView/);
  assert.match(dashboard, /GymRoutineDashboardView/);
});

test('Gym mantiene la carga compartida como lectura derivada y sin nueva escritura', () => {
  const loader = source('lib/gym/page-data.ts');
  assert.match(loader, /loadGymDashboard/);
  assert.match(loader, /loadGymWeeklyCardio/);
  assert.equal(/create|update|delete|write/i.test(loader), false);
});

test('Gym Rutina acerca la última ejecución comparable al ejercicio prescripto', () => {
  const routine = source('components/gym/GymRoutineTabs.tsx');
  const dashboard = source('components/gym/GymDashboard.tsx');

  assert.match(routine, /Última sesión comparable/);
  assert.match(routine, /Último entrenamiento completado/);
  assert.match(routine, /completed === true/);
  assert.ok(routine.includes('session.date <= input.today'));
  assert.match(dashboard, /sessions=\{data\.sessions \?\? \[\]\}/);
  assert.match(dashboard, /summaries=\{data\.sessionSummaries\}/);
});

test('Gym Progreso no repite el resumen ni la tabla completa de semana anterior', () => {
  const progress = source('components/gym/GymV2Overview.tsx');

  assert.doesNotMatch(progress, /GymPreviousWeek/);
  assert.doesNotMatch(progress, /gym-v2-insights-title/);
  assert.match(progress, /gym-v2-exercises-title/);
  assert.match(progress, /gym-v2-benchmark-title/);
});

test('Gym muestra objetivos personales desde Notion como sección separada del benchmark externo', () => {
  const progress = source('components/gym/GymV2Overview.tsx');
  const dashboard = source('components/gym/GymDashboard.tsx');
  assert.match(progress, /Metas personales de fuerza/);
  assert.match(progress, /buildPersonalStrengthGoals/);
  assert.match(dashboard, /routine=\{data\.routine\}/);
  assert.ok(
    progress.indexOf('gym-personal-strength-goals-title') <
      progress.indexOf('gym-v2-benchmark-title'),
  );
});

test('Gym Cardio prioriza el plan real antes de la equivalencia MET-min', () => {
  const cardio = source('components/gym/GymWeeklyCardio.tsx');
  const planIndex = cardio.indexOf('Tu plan real');
  const equivalentIndex = cardio.indexOf('Equivalencia acumulada');

  assert.ok(planIndex >= 0);
  assert.ok(equivalentIndex >= 0);
  assert.ok(planIndex < equivalentIndex);
});

test('Gym jerarquiza detalle secundario mediante progressive disclosure', () => {
  const dashboard = source('components/gym/GymDashboard.tsx');
  const routine = source('components/gym/GymRoutineTabs.tsx');
  const progress = source('components/gym/GymV2Overview.tsx');

  assert.match(dashboard, /Contexto de Salud y agenda/);
  assert.doesNotMatch(dashboard, /Actividad reciente:/);
  assert.match(routine, /Movilidad \/ postura/);
  assert.match(routine, /setView\('mobility'\)/);
  assert.match(routine, /Rutina fija/);
  assert.match(routine, /Última sesión/);
  assert.match(routine, /Progresión y descarga/);
  assert.doesNotMatch(routine, /key: 'mobility',\s*title: 'Movilidad \/ postura'/);
  assert.match(progress, /Referencia externa/);
  assert.match(progress, /benchmark-disclosure/);
});

test('Gym mantiene revisión mensual e historial como acciones secundarias', () => {
  const dashboard = source('components/gym/GymDashboard.tsx');
  const review = source('components/domain/MonthlyReviewCard.tsx');

  assert.match(dashboard, /slice\(0, 6\)/);
  assert.match(dashboard, /Ver sesiones anteriores/);
  assert.match(dashboard, /MonthlyReviewCard domain="gym" compact/);
  assert.match(review, /compact\?: boolean/);
});

test('Gym Rutina separa complementos por función y omite cardio/metadatos', () => {
  const routine = source('components/gym/GymRoutineTabs.tsx');

  assert.match(routine, /Movilidad \/ postura/);
  assert.match(routine, /Progresión y descarga/);
  assert.doesNotMatch(routine, /const cardioSections/);
  assert.match(routine, /versi\[oó\]n/);
  assert.doesNotMatch(routine, /Movilidad, recuperación y complementos/);
  assert.doesNotMatch(routine, /bloque\(s\)/);
});

test('Gym deja diagnósticos técnicos sólo en Resumen y colapsados por defecto', () => {
  const dashboard = source('components/gym/GymDashboard.tsx');
  const warningUsages = dashboard.match(/<WarningCard data=\{data\} \/>/g) ?? [];

  assert.equal(warningUsages.length, 1);
  assert.match(dashboard, /Diagnóstico de datos/);
  assert.match(dashboard, /diagnostic-disclosure/);
});

test('Cardio separa visualmente la carga equivalente de su explicación', () => {
  const styles = source('components/gym/GymWeeklyCardio.module.scss');
  assert.match(styles, /\.secondary-heading/);
  assert.match(styles, /display: flex/);
});

test('Rutina V4 es alternativa visible, sin sustituir Notion ni última sesión', () => {
  const tabs = source('components/gym/GymRoutineTabs.tsx');
  const renderer = source('components/gym/GymRoutineV4.tsx');
  const sourceData = source('lib/gym/routine-v4-proposal.ts');

  assert.match(tabs, /Rutina fija/);
  assert.match(tabs, /Última sesión/);
  assert.match(tabs, /Movilidad \/ postura/);
  assert.match(tabs, /Rutina V4/);
  assert.match(tabs, /setView\('v4'\)/);
  assert.match(tabs, /GymRoutineV4/);
  assert.match(renderer, /La rutina fija sigue siendo el plan vigente de Notion/);
  assert.match(renderer, /70 min/);
  assert.match(renderer, /75 min/);
  assert.match(renderer, /Movilidad y estiramientos/);
  assert.match(renderer, /Cómo manejar pesos, RIR y descansos/);
  assert.match(renderer, /tres días consecutivos/);
  assert.doesNotMatch(sourceData, /fetch\(|createClient|insert\(/);
});

test('Rutina V4 reproduce exactamente los 3 días y las 74 series propuestas', () => {
  assert.deepEqual(GYM_V4_DAYS.map((day) => day.id), ['a', 'b', 'c']);
  assert.deepEqual([...GYM_V4_DAY_SETS], [25, 24, 25]);
  assert.equal(GYM_V4_WEEKLY_SETS, 74);
  assert.deepEqual(GYM_V4_DAYS.map((day) => day.exercises.length), [9, 9, 9]);
  assert.equal(GYM_V4_DAYS[0]?.exercises[0]?.name, 'Press inclinado máquina');
  assert.equal(GYM_V4_DAYS[1]?.exercises[0]?.name, 'Prensa horizontal');
  assert.equal(GYM_V4_DAYS[2]?.exercises[3]?.name, 'Press militar');
  assert.equal(GYM_V4_DAYS[1]?.exercises[2]?.rest, '75–90 s');
  assert.ok(GYM_V4_DAYS[1]?.exercises[2]?.note?.includes('tumbado'));
  assert.ok(GYM_V4_DAYS.every((day) => day.mobility.length > 0));
});
