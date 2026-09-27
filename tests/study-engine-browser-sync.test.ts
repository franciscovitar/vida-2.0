import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { BrowserOnlineSource } from '@/lib/study-engine/browser-sync';

class FakeOnlineSource implements BrowserOnlineSource {
  private listener: (() => void) | null = null;

  addEventListener(type: 'online', listener: () => void) {
    assert.equal(type, 'online');
    this.listener = listener;
  }

  removeEventListener(type: 'online', listener: () => void) {
    assert.equal(type, 'online');
    if (this.listener === listener) this.listener = null;
  }

  fireOnline() {
    this.listener?.();
  }

  hasListener() {
    return this.listener !== null;
  }
}

test('browser reconnect source can attach and detach one online listener', () => {
  const source = new FakeOnlineSource();
  const listener = () => {};

  source.addEventListener('online', listener);
  assert.equal(source.hasListener(), true);

  source.removeEventListener('online', listener);
  assert.equal(source.hasListener(), false);
});
