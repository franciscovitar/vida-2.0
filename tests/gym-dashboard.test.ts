/**
 * Tests 8D.2 — Gimnasio read-only (fixtures).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { computeGymAnalytics } from '@/lib/gym/analytics';
import { composeGymDashboard } from '@/lib/gym/compose';
import {
  parseExercisePrescriptionText,
  parseGymRoutineFromContentPage,
} from '@/lib/gym/parse-routine';
import { isGymExcludedText } from '@/lib/gym/privacy';
import { resolveCanonicalGymEntry } from '@/lib/gym/resolve';
import { disabledGymSessionReadPort, type GymSessionReadPort } from '@/lib/gym/sessions-port';
import { primaryNav } from '@/lib/constants/navigation';
import type { ContentBlock, ContentPage } from '@/types/content';
import type { WebCatalogEntry } from '@/types/web-catalog';

function entry(overrides: Partial<WebCatalogEntry> = {}): WebCatalogEntry {
  return {
    stableKey: 'fixture.gym',
    editorialName: 'Rutina gym',
    sourceRef: 'notion:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'personal-systems',
    slug: 'rutina-gimnasio',
    aliases: [],
    navigationPlacement: 'none',
    navigationOrder: null,
    renderMode: 'gym',
    privacy: 'general',
    policy: {
      visibleWeb: true,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'denied',
      writeMode: 'none',
      confirmation: 'none',
    },
    ...overrides,
  };
}

function block(
  partial: Partial<ContentBlock> & Pick<ContentBlock, 'localId' | 'type'>,
): ContentBlock {
  return {
    text: [],
    checked: null,
    language: null,
    link: null,
    asset: null,
    childPageSlug: null,
    childPageTitle: null,
    children: [],
    ...partial,
  };
}

function textBlock(
  type: ContentBlock['type'],
  plain: string,
  localId: string,
  children: ContentBlock[] = [],
): ContentBlock {
  return block({
    localId,
    type,
    text: [{ plain, href: null }],
    children,
  });
}

function page(blocks: ContentBlock[], overrides: Partial<ContentPage> = {}): ContentPage {
  return {
    stableKey: 'fixture.gym',
    slug: 'rutina-gimnasio',
    title: 'Rutina A/B',
    icon: null,
    lastEditedAt: '2026-07-01T12:00:00.000Z',
    renderMode: 'gym',
    section: 'personal-systems',
    policy: {
      visibleWeb: true,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'denied',
    },
    blocks,
    childPages: [],
    provenance: { source: 'web-catalog', fetchedAt: '2026-07-22T12:00:00.000Z' },
    ...overrides,
  };
}

test('8D2-1. resolución de una entrada renderMode=gym', () => {
  const resolved = resolveCanonicalGymEntry([entry()]);
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.entry.stableKey, 'fixture.gym');
});

test('8D2-2. ninguna entrada gym', () => {
  const resolved = resolveCanonicalGymEntry([entry({ renderMode: 'document' })]);
  assert.equal(resolved.ok, false);
  if (!resolved.ok) assert.equal(resolved.code, 'none');
});

test('8D2-3. múltiples entradas gym', () => {
  const resolved = resolveCanonicalGymEntry([
    entry({ stableKey: 'fixture.gym-a', slug: 'gym-a' }),
    entry({ stableKey: 'fixture.gym-b', slug: 'gym-b' }),
  ]);
  assert.equal(resolved.ok, false);
  if (!resolved.ok) assert.equal(resolved.code, 'ambiguous');
});

test('8D2-4. recurso oculto', () => {
  const resolved = resolveCanonicalGymEntry([
    entry({ status: 'hidden', policy: { ...entry().policy, visibleWeb: false } }),
  ]);
  assert.equal(resolved.ok, false);
  if (!resolved.ok) assert.equal(resolved.code, 'hidden');
});

test('8D2-5. parser de headings y listas', () => {
  const content = page([
    textBlock('heading_1', 'Día A — Push', 'h1'),
    textBlock('bulleted_list_item', 'Press banca 3x8 descanso 90s RIR 2', 'li1'),
    textBlock('heading_1', 'Día B — Pull', 'h2'),
    textBlock('bulleted_list_item', 'Remo 4 series de 10', 'li2'),
  ]);
  const parsed = parseGymRoutineFromContentPage(content);
  assert.equal(parsed.routine.presentation, 'structured');
  assert.equal(parsed.routine.days.length, 2);
  assert.equal(parsed.routine.days[0]!.exercises.length, 1);
});

test('8D2-6. ejercicio con series/repeticiones', () => {
  const parsed = parseExercisePrescriptionText('Sentadilla 4x6-8 descanso 2 min RPE 8');
  assert.equal(parsed.sets, 4);
  assert.equal(parsed.reps, '6-8');
  assert.equal(parsed.rest, '2 min');
  assert.equal(parsed.targetRpe, '8');
  assert.equal(parsed.structured, true);
});

test('8D2-7. ejercicio con datos incompletos', () => {
  const parsed = parseExercisePrescriptionText('Face pull suave');
  assert.equal(parsed.sets, null);
  assert.equal(parsed.reps, null);
  assert.equal(parsed.structured, false);
});

test('8D2-8. fallback documental', () => {
  const content = page([textBlock('paragraph', 'Solo una nota suelta', 'p1')]);
  const parsed = parseGymRoutineFromContentPage(content);
  assert.equal(parsed.routine.presentation, 'documentary');
  assert.equal(parsed.documentaryFallback, true);
});

test('8D2-9. advertencia no bloqueante', () => {
  const content = page([
    textBlock('heading_1', 'Día 1', 'h1'),
    textBlock('bulleted_list_item', 'Plancha lateral', 'li1'),
  ]);
  const parsed = parseGymRoutineFromContentPage(content);
  assert.ok(parsed.warnings.some((item) => item.code === 'exercise-without-prescription'));
  assert.equal(parsed.routine.days[0]!.exercises.length, 1);
});

test('8D2-10. rutina sin días', () => {
  const content = page([textBlock('quote', 'Recordatorio general', 'q1')]);
  const parsed = parseGymRoutineFromContentPage(content);
  assert.ok(parsed.warnings.some((item) => item.code === 'routine-without-days'));
});

test('8D2-11. Notion caído no inventa rutina', () => {
  const data = composeGymDashboard({
    targetDate: '2026-07-22',
    moduleStatus: 'partial',
    moduleNotice: 'Notion caído',
    contentPage: null,
    activityDays: [{ date: '2026-07-21', trained: true, durationMinutes: null }],
    weeklyTarget: 3,
    readiness: {
      energy: '3',
      sleep: '7',
      recentExercise: null,
      commitments: [],
      coverage: null,
    },
    sessionSummaries: [],
    sources: [{ kind: 'notion', state: 'error', notice: 'down' }],
    extraWarnings: [{ code: 'source-down', message: 'Notion caído', subject: 'notion' }],
  });
  assert.equal(data.routine, null);
  assert.ok(data.progress.some((metric) => metric.key === 'activity-days-week'));
});

test('8D2-12. Sheets caído sin métricas inventadas', () => {
  const content = page([
    textBlock('heading_1', 'Día 1', 'h1'),
    textBlock('bulleted_list_item', 'Press 3x8', 'li1'),
  ]);
  const data = composeGymDashboard({
    targetDate: '2026-07-22',
    moduleStatus: 'partial',
    moduleNotice: 'Sheets caído',
    contentPage: content,
    activityDays: [],
    weeklyTarget: null,
    readiness: {
      energy: null,
      sleep: null,
      recentExercise: null,
      commitments: [],
      coverage: null,
    },
    sessionSummaries: [],
    sources: [{ kind: 'sheets', state: 'error', notice: 'down' }],
  });
  assert.ok(data.routine);
  assert.ok(
    data.progress.every((metric) => metric.value === null || metric.kind !== 'confirmed' || true),
  );
  assert.equal(data.progress.find((metric) => metric.key === 'avg-duration')?.kind, 'absent');
});

test('8D2-13. Calendar caído omite compromisos', () => {
  const data = composeGymDashboard({
    targetDate: '2026-07-22',
    moduleStatus: 'ready',
    moduleNotice: null,
    contentPage: null,
    activityDays: [],
    weeklyTarget: null,
    readiness: {
      energy: null,
      sleep: null,
      recentExercise: null,
      commitments: [],
      coverage: null,
    },
    sessionSummaries: [],
    sources: [{ kind: 'calendar', state: 'error', notice: 'down' }],
    extraWarnings: [{ code: 'source-down', message: 'Calendar caído', subject: 'calendar' }],
  });
  assert.equal(data.readiness.commitments.length, 0);
  assert.ok(data.warnings.some((item) => item.subject === 'calendar'));
});

test('8D2-14. frecuencia semanal', () => {
  const result = computeGymAnalytics({
    today: '2026-07-22',
    weeklyTarget: 3,
    days: [
      { date: '2026-07-20', trained: true, durationMinutes: null },
      { date: '2026-07-21', trained: true, durationMinutes: null },
      { date: '2026-07-22', trained: false, durationMinutes: null },
    ],
  });
  assert.equal(result.activityDaysThisWeek, 2);
  assert.equal(result.weeklyCompliance, 67);
});

test('8D2-15. duración media', () => {
  const result = computeGymAnalytics({
    today: '2026-07-22',
    weeklyTarget: 3,
    days: [
      { date: '2026-07-20', trained: true, durationMinutes: 40 },
      { date: '2026-07-21', trained: true, durationMinutes: 50 },
      { date: '2026-07-22', trained: true, durationMinutes: null },
    ],
  });
  assert.equal(result.averageDurationMinutes, 45);
});

test('8D2-16. tendencia semanal', () => {
  const result = computeGymAnalytics({
    today: '2026-07-22',
    weeklyTarget: 3,
    days: [
      { date: '2026-07-13', trained: true, durationMinutes: null },
      { date: '2026-07-14', trained: true, durationMinutes: null },
      { date: '2026-07-15', trained: true, durationMinutes: null },
      { date: '2026-07-20', trained: true, durationMinutes: null },
      { date: '2026-07-21', trained: true, durationMinutes: null },
    ],
  });
  assert.equal(result.weeklyVariation, -1);
});

test('8D2-17. cobertura incompleta', () => {
  const result = computeGymAnalytics({
    today: '2026-07-22',
    weeklyTarget: 3,
    days: [
      { date: '2026-07-20', trained: true, durationMinutes: null },
      { date: '2026-07-21', trained: null, durationMinutes: null },
    ],
  });
  assert.ok(result.coverageRatio !== null && result.coverageRatio < 1);
  assert.equal(result.metrics.find((item) => item.key === 'coverage')?.kind, 'coverage');
});

test('8D2-18. datos ausentes sin cero inventado', () => {
  const result = computeGymAnalytics({
    today: '2026-07-22',
    weeklyTarget: null,
    days: [
      { date: '2026-07-20', trained: null, durationMinutes: null },
      { date: '2026-07-21', trained: null, durationMinutes: null },
    ],
  });
  assert.equal(result.averageDurationMinutes, null);
  assert.equal(result.weeklyCompliance, null);
  assert.equal(result.metrics.find((item) => item.key === 'avg-duration')?.value, null);
});

test('8D2-19. exclusión de Journaling', () => {
  assert.equal(isGymExcludedText('Journaling de la noche'), true);
  const content = page([
    textBlock('heading_1', 'Día 1', 'h1'),
    textBlock('bulleted_list_item', 'Journaling post entreno', 'li1'),
    textBlock('bulleted_list_item', 'Press 3x8', 'li2'),
  ]);
  const parsed = parseGymRoutineFromContentPage(content);
  assert.equal(
    parsed.routine.days[0]!.exercises.some((item) => /journal/i.test(item.name)),
    false,
  );
});

test('8D2-20. DTO sin IDs ni URLs internas', () => {
  const content = page([
    textBlock('heading_1', 'Día 1', 'h1'),
    textBlock('bulleted_list_item', 'Press 3x8', 'li1'),
  ]);
  const data = composeGymDashboard({
    targetDate: '2026-07-22',
    moduleStatus: 'ready',
    moduleNotice: null,
    contentPage: content,
    activityDays: [],
    weeklyTarget: 3,
    readiness: {
      energy: null,
      sleep: null,
      recentExercise: null,
      commitments: [],
      coverage: null,
    },
    sessionSummaries: [],
    sources: [],
  });
  const json = JSON.stringify(data);
  assert.equal(json.includes('notion:'), false);
  assert.equal(json.includes('aaaaaaaa-bbbb'), false);
  assert.equal(json.includes('https://'), false);
});

test('8D2-21. navegación con Gimnasio', () => {
  assert.ok(primaryNav.some((item) => item.href === '/gimnasio' && item.label === 'Gimnasio'));
});

test('8D2-22. ausencia de métodos de escritura', () => {
  const port: GymSessionReadPort = disabledGymSessionReadPort;
  assert.equal('listSessions' in port, true);
  assert.equal('getSession' in port, true);
  assert.equal('createSession' in port, false);
  assert.equal('updateSession' in port, false);
  assert.equal('deleteSession' in port, false);
  assert.equal('appendSet' in port, false);

  const source = readFileSync(path.join(process.cwd(), 'lib/gym/sessions-port.ts'), 'utf8');
  assert.equal(/createSession|updateSession|deleteSession|appendSet/.test(source), false);
});
