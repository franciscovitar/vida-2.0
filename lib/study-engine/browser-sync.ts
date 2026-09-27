'use client';

import type { AttemptOutboxStore } from './attempt-store';
import {
  StudyAttemptSyncEngine,
  type StudyAttemptTransport,
} from './sync-engine';

export interface BrowserOnlineSource {
  addEventListener(type: 'online', listener: () => void): void;
  removeEventListener(type: 'online', listener: () => void): void;
}

export interface StudyReconnectController {
  flushNow(): Promise<void>;
  dispose(): void;
}

export function attachStudyReconnectSync(
  store: AttemptOutboxStore,
  transport: StudyAttemptTransport,
  source: BrowserOnlineSource = window,
  isOnline: () => boolean = () => navigator.onLine,
): StudyReconnectController {
  const engine = new StudyAttemptSyncEngine(store, transport);

  const flushNow = async () => {
    if (!isOnline()) return;
    await engine.flush();
  };

  const onOnline = () => {
    void flushNow();
  };

  source.addEventListener('online', onOnline);

  if (isOnline()) {
    void flushNow();
  }

  return {
    flushNow,
    dispose() {
      source.removeEventListener('online', onOnline);
    },
  };
}
