import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAchievementsView } from '@/lib/achievements/view';

type Prop = Record<string, unknown>;
const text = (s: string) => ({ rich_text: [{ plain_text: s }] });
const pick = (s: string) => ({ select: { name: s } });
function row(overrides: Prop = {}) {
  return {
    properties: {
      Nombre: { title: [{ plain_text: 'Aprobé un parcial' }] },
      ClaveEvento: text('university:example:p2:passed'),
      Categoria: pick('ACADEMIC'),
      Asercion: pick('SELF_REPORTED'),
      Fecha: { date: { start: '2026-10-20' } },
      Estado: pick('ACCEPTED'),
      Sensibilidad: pick('STANDARD'),
      RegistroAutorizado: { checkbox: true },
      RefPrivada: text('source:never-expose'),
      ...overrides,
    },
  };
}

test('accepted self-report is visible with restricted fields only', () => {
  const view = buildAchievementsView([row()]);
  assert.equal(view.state, 'ready');
  assert.equal(view.items.length, 1);
  assert.deepEqual(Object.keys(view.items[0]!).sort(), [
    'category',
    'evidenceLabel',
    'occurredOn',
    'title',
  ]);
  assert.doesNotMatch(JSON.stringify(view), /source:never-expose|ClaveEvento|RefPrivada/);
});

test('unaccepted journal proposal never appears', () => {
  assert.deepEqual(buildAchievementsView([row({ Estado: pick('PROPOSED') })]), {
    state: 'empty',
    items: [],
  });
});

test('empty source does not claim achievements', () => {
  assert.deepEqual(buildAchievementsView([]), { state: 'empty', items: [] });
});

test('missing explicit authorization fails closed', () => {
  const result = buildAchievementsView([row({ RegistroAutorizado: { checkbox: false } })]);
  assert.equal(result.state, 'degraded');
  assert.equal(result.items.length, 0);
});

test('sensitive and review-required entries are excluded', () => {
  for (const s of ['EXCLUDED', 'REVIEW_REQUIRED']) {
    assert.equal(buildAchievementsView([row({ Sensibilidad: pick(s) })]).items.length, 0);
  }
});

test('malformed event identity and category are ignored', () => {
  const view = buildAchievementsView([
    row({ ClaveEvento: text('garbage') }),
    row({ Categoria: pick('UNSUPPORTED') }),
  ]);
  assert.equal(view.state, 'degraded');
  assert.equal(view.items.length, 0);
});

test('ambiguous duplicated event identity removes all colliding entries', () => {
  const view = buildAchievementsView([
    row(),
    row({ Nombre: { title: [{ plain_text: 'Distinto nombre' }] } }),
  ]);
  assert.equal(view.state, 'degraded');
  assert.equal(view.items.length, 0);
});

test('email, keys and multiline titles never enter the view', () => {
  for (const name of ['user@example.com', 'token=secret', 'first\nsecond']) {
    const view = buildAchievementsView([row({ Nombre: { title: [{ plain_text: name }] } })]);
    assert.equal(view.items.length, 0);
  }
});

test('invalid date does not silently become today', () => {
  const view = buildAchievementsView([row({ Fecha: { date: { start: '2026-02-30' } } })]);
  assert.equal(view.items.length, 0);
});

test('unknown date remains null', () => {
  const view = buildAchievementsView([row({ Fecha: { date: null } })]);
  assert.equal(view.items[0]?.occurredOn, null);
});

test('source with more pages explicitly degrades', () => {
  const view = buildAchievementsView([row()], { hasMore: true });
  assert.equal(view.state, 'degraded');
  assert.equal(view.items.length, 1);
});

test('owner-verified label does not claim independent readback', () => {
  const view = buildAchievementsView([row({ Asercion: pick('OWNER_VERIFIED') })]);
  assert.equal(view.items[0]?.evidenceLabel, 'Marcado como verificado en Logros');
});

test('source entries over 30 remain visible', () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    row({ ClaveEvento: text('project:example:item' + i + ':complete') }),
  );
  assert.equal(buildAchievementsView(rows).items.length, 40);
});

test('an owner-approved detailed memory renders with names and line breaks but no source pointer', () => {
  const result = buildAchievementsView([
    row({
      Recuerdo: {
        rich_text: [
          { plain_text: 'En el cumpleaños de Claudia me daba vergüenza bailar.\n' },
          { plain_text: 'Estuve con Val, Fer y Juan; terminé bailando igual.' },
        ],
      },
    }),
  ]);
  assert.equal(result.state, 'ready');
  assert.equal(
    result.items[0]?.story,
    'En el cumpleaños de Claudia me daba vergüenza bailar.\nEstuve con Val, Fer y Juan; terminé bailando igual.',
  );
  assert.doesNotMatch(JSON.stringify(result), /source:never-expose/);
});

test('legacy entries without Recuerdo remain visible without an invented story', () => {
  const result = buildAchievementsView([row()]);
  assert.equal(result.state, 'ready');
  assert.equal('story' in result.items[0]!, false);
});

test('malformed, secret-bearing and oversized stories fail closed', () => {
  for (const value of [
    { rich_text: [{ plain_text: 'token=topsecret' }] },
    { rich_text: [{ plain_text: 'a'.repeat(1801) }] },
    { rich_text: [{ text: { content: 'missing plain_text' } }] },
    { rich_text: 'wrong-shape' },
  ]) {
    const result = buildAchievementsView([row({ Recuerdo: value })]);
    assert.equal(result.state, 'degraded');
    assert.equal(result.items.length, 0);
  }
});

test('an unapproved narrative is not displayed even if its text is well formed', () => {
  const result = buildAchievementsView([
    row({ Recuerdo: { rich_text: [{ plain_text: 'A private story' }] }, Estado: pick('PROPOSED') }),
  ]);
  assert.deepEqual(result, { state: 'empty', items: [] });
});
