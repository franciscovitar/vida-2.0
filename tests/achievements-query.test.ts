import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAchievementsFromNotionQuery } from '@/lib/achievements/view';

const dataSourceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const pick = (name: string) => ({ type: 'select', select: { name } });
function page(overrides: Record<string, unknown> = {}) {
  return {
    object: 'page',
    archived: false,
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: {
      Nombre: { type: 'title', title: [{ plain_text: 'Hito académico sintético' }] },
      ClaveEvento: {
        type: 'rich_text',
        rich_text: [{ plain_text: 'university:synthetic:exam:passed' }],
      },
      Categoria: pick('ACADEMIC'),
      Asercion: pick('OWNER_VERIFIED'),
      Fecha: { type: 'date', date: { start: '2026-10-21', end: null } },
      Estado: pick('ACCEPTED'),
      Sensibilidad: pick('STANDARD'),
      RegistroAutorizado: { type: 'checkbox', checkbox: true },
      RefPrivada: { rich_text: [{ plain_text: 'private:do-not-serialize' }] },
    },
    ...overrides,
  };
}
const query = (rows: unknown[] = [page()]) => ({
  object: 'list',
  has_more: false,
  results: rows,
});

test('one accepted Notion API page becomes one minimal achievement', () => {
  const result = buildAchievementsFromNotionQuery(query(), dataSourceId);
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.items, [
    {
      title: 'Hito académico sintético',
      occurredOn: '2026-10-21',
      category: 'ACADEMIC',
      evidenceLabel: 'Marcado como verificado en Logros',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /university:synthetic|private:do-not-serialize/);
});

test('unaccepted proposal from the right source is never published', () => {
  const p = page();
  p.properties.Estado = pick('PROPOSED');
  const result = buildAchievementsFromNotionQuery(query([p]), dataSourceId);
  assert.deepEqual(result, { state: 'empty', items: [] });
});

test('a foreign-source page is excluded and makes the response partial', () => {
  const foreign = page({
    parent: { type: 'data_source_id', data_source_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  });
  const result = buildAchievementsFromNotionQuery(query([page(), foreign]), dataSourceId);
  assert.equal(result.state, 'degraded');
  assert.equal(result.items.length, 1);
});

test('archived, malformed and non-page responses fail closed', () => {
  for (const other of [
    page({ archived: true }),
    page({ properties: null }),
    page({ object: 'database' }),
    page({ parent: null }),
  ]) {
    const result = buildAchievementsFromNotionQuery(query([other]), dataSourceId);
    assert.equal(result.state, 'degraded');
    assert.equal(result.items.length, 0);
  }
});

test('malformed or truncated source query never reports a complete reading', () => {
  for (const other of [null, {}, { results: [] }, { has_more: false, results: {} }]) {
    assert.deepEqual(buildAchievementsFromNotionQuery(other, dataSourceId), {
      state: 'unavailable',
      items: [],
    });
  }
  assert.equal(
    buildAchievementsFromNotionQuery({ has_more: true, results: [page()] }, dataSourceId).state,
    'degraded',
  );
});

test('duplicate identity is never displayed', () => {
  const result = buildAchievementsFromNotionQuery(query([page(), page()]), dataSourceId);
  assert.deepEqual(result, { state: 'degraded', items: [] });
});

test('a failed authorization or sensitivity check removes the row', () => {
  const sensitive = page();
  sensitive.properties.Sensibilidad = pick('REVIEW_REQUIRED');
  const unauthorized = page();
  unauthorized.properties.RegistroAutorizado = { type: 'checkbox', checkbox: false };
  const result = buildAchievementsFromNotionQuery(query([sensitive, unauthorized]), dataSourceId);
  assert.deepEqual(result, { state: 'degraded', items: [] });
});
