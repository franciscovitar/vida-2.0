import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPublicAuthPath, resolveAuthProxyDecision } from '@/lib/auth/authorize';

const ALLOWED = ['owner@example.com'] as const;

test('block5 delivery claim: proxy permite solo la ruta machine exacta nueva', () => {
  const pathname = '/api/automations/v1/deliveries/claim';
  assert.equal(isPublicAuthPath(pathname), true);
  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname,
      hasUser: false,
      email: null,
      allowedEmails: ALLOWED,
    }),
    { action: 'next' },
  );

  for (const protectedPath of [
    '/api/automations/v1/deliveries',
    '/api/automations/v1/deliveries/claim/otro',
  ]) {
    assert.equal(isPublicAuthPath(protectedPath), false);
    assert.deepEqual(
      resolveAuthProxyDecision({
        pathname: protectedPath,
        hasUser: false,
        email: null,
        allowedEmails: ALLOWED,
      }),
      { action: 'redirect', pathname: '/login' },
    );
  }
});
