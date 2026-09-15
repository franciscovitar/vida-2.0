import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canToggleRewatch,
  parseMediaRewatchRequest,
  rewatchBaseState,
  rewatchTargetState,
} from '@/lib/media/rewatch';

test('Reveer usa como estado base Vista en películas y Terminada en series', () => {
  assert.equal(rewatchBaseState('movie'), 'Vista');
  assert.equal(rewatchBaseState('series'), 'Terminada');
  assert.equal(rewatchTargetState('movie', true), 'Reveer');
  assert.equal(rewatchTargetState('movie', false), 'Vista');
  assert.equal(rewatchTargetState('series', false), 'Terminada');
});

test('una película sólo puede entrar en Reveer si ya estaba Vista', () => {
  assert.equal(canToggleRewatch('movie', 'Vista', true), true);
  assert.equal(canToggleRewatch('movie', 'Reveer', true), true);
  assert.equal(canToggleRewatch('movie', 'Por ver', true), false);
  assert.equal(canToggleRewatch('movie', 'Abandonada', true), false);
});

test('sacar Reveer devuelve una película a Vista y una serie a Terminada', () => {
  assert.equal(canToggleRewatch('movie', 'Reveer', false), true);
  assert.equal(canToggleRewatch('movie', 'Vista', false), true);
  assert.equal(canToggleRewatch('series', 'Reveer', false), true);
  assert.equal(canToggleRewatch('series', 'Terminada', false), true);
});

test('una serie sólo puede entrar en Reveer si ya estaba Terminada', () => {
  assert.equal(canToggleRewatch('series', 'Terminada', true), true);
  assert.equal(canToggleRewatch('series', 'Reveer', true), true);
  assert.equal(canToggleRewatch('series', 'Por ver', true), false);
  assert.equal(canToggleRewatch('series', 'Viendo', true), false);
  assert.equal(canToggleRewatch('series', 'Al día', true), false);
});

test('request Reveer acepta sólo key, medium y enabled válidos', () => {
  assert.deepEqual(
    parseMediaRewatchRequest({ key: 'movie:Heat:1995', medium: 'movie', enabled: true }),
    { key: 'movie:Heat:1995', medium: 'movie', enabled: true },
  );
  assert.equal(parseMediaRewatchRequest({ key: '', medium: 'movie', enabled: true }), null);
  assert.equal(
    parseMediaRewatchRequest({ key: 'movie:Heat:1995', medium: 'book', enabled: true }),
    null,
  );
  assert.equal(
    parseMediaRewatchRequest({ key: 'movie:Heat:1995', medium: 'movie', enabled: 'true' }),
    null,
  );
});
