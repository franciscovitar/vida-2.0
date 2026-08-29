import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isVidaOperation,
  isVidaProposeOperation,
  isVidaReadOperation,
  listVidaOperations,
  resolveOperationRoute,
} from '../openclaw-plugin/vida-2-0-api/src/operations';

test('exact path/method mapping for every closed read operation', () => {
  const readOps = [
    'system.overview',
    'areas.list',
    'areas.get',
    'tasks.list',
    'projects.list',
    'calendar.upcoming',
    'gym.summary',
    'approvals.list',
    'documents.search',
    'document.get',
    'technical.status',
    'technical.logs',
  ];
  for (const operation of readOps) {
    const route = resolveOperationRoute(operation);
    assert.ok(route, `expected a route for ${operation}`);
    assert.equal(route?.method, 'POST');
    assert.equal(route?.pathname, '/api/openclaw/v1/read');
    assert.equal(route?.kind, 'read');
  }
});

test('exact path/method mapping for every closed propose operation', () => {
  const proposeOps = [
    'task.create.propose',
    'task.change-status.propose',
    'inbox.capture.propose',
    'gym.session.create.propose',
    'calendar.hold.create.propose',
  ];
  for (const operation of proposeOps) {
    const route = resolveOperationRoute(operation);
    assert.ok(route, `expected a route for ${operation}`);
    assert.equal(route?.method, 'POST');
    assert.equal(route?.pathname, '/api/openclaw/v1/proposals');
    assert.equal(route?.kind, 'propose');
  }
});

test('exact path/method mapping for the universal protocol health check', () => {
  const route = resolveOperationRoute('system.health');
  assert.ok(route);
  assert.equal(route?.method, 'GET');
  assert.equal(route?.pathname, '/api/openclaw/v1/health');
  assert.equal(route?.kind, 'protocol');
});

test('unknown operation is denied: resolveOperationRoute returns null, never a guessed route', () => {
  assert.equal(resolveOperationRoute('not-a-real-operation'), null);
  assert.equal(resolveOperationRoute(''), null);
  assert.equal(resolveOperationRoute('system.overview '), null);
  assert.equal(resolveOperationRoute('SYSTEM.OVERVIEW'), null);
});

test('arbitrary URL/path/method is impossible: routes never come from operation-string content', () => {
  // An attacker-shaped operation id that embeds a different path/host/method
  // as a substring must still resolve to null, not to a route derived from
  // that substring. There is no parsing of the operation string itself.
  const hostile = [
    'areas.list/../../admin',
    'system.overview?evil=1',
    'system.overview\nX-Injected: 1',
    'https://evil.example.com/api/openclaw/v1/read',
    'GET /api/openclaw/v1/health',
  ];
  for (const operation of hostile) {
    assert.equal(
      resolveOperationRoute(operation),
      null,
      `expected null for hostile operation: ${operation}`,
    );
  }
});

test('query strings are impossible: no route pathname ever contains a "?"', () => {
  for (const operation of listVidaOperations()) {
    const route = resolveOperationRoute(operation);
    assert.ok(route);
    assert.equal(route?.pathname.includes('?'), false);
  }
});

test('Journaling is inaccessible: no operation id or route pathname references journaling', () => {
  for (const operation of listVidaOperations()) {
    assert.equal(operation.toLowerCase().includes('journal'), false);
    const route = resolveOperationRoute(operation);
    assert.equal(route?.pathname.toLowerCase().includes('journal'), false);
  }
  // A caller cannot invent a journaling operation id and have it resolve.
  assert.equal(resolveOperationRoute('journal.read'), null);
  assert.equal(resolveOperationRoute('journaling.get'), null);
});

test('every closed operation classifies consistently across the read/propose/is-operation predicates', () => {
  for (const operation of listVidaOperations()) {
    assert.equal(isVidaOperation(operation), true);
    const readClassified = isVidaReadOperation(operation);
    const proposeClassified = isVidaProposeOperation(operation);
    assert.equal(
      readClassified && proposeClassified,
      false,
      `${operation} must not be classified as both`,
    );
  }
  assert.equal(isVidaOperation('not-real'), false);
});
