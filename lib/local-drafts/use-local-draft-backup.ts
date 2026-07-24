'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  LOCAL_DRAFT_TTL_MS,
  readLocalDraft,
  removeLocalDraft,
  writeLocalDraft,
  type LocalDraftKey,
} from '@/lib/local-drafts/storage';

export type LocalDraftPersistenceState = 'loading' | 'empty' | 'restored' | 'saved' | 'error';

export interface LocalDraftController {
  state: LocalDraftPersistenceState;
  savedAt: string | null;
  error: string | null;
  clear: () => void;
}

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface UseLocalDraftBackupOptions<T> {
  key: LocalDraftKey;
  value: T;
  validate: (value: unknown) => value is T;
  hasContent: (value: T) => boolean;
  onRestore: (value: T) => void;
  onClear: () => void;
  acceptRestored?: (value: T) => boolean;
  ttlMs?: number;
}

export function useLocalDraftBackup<T>({
  key,
  value,
  validate,
  hasContent,
  onRestore,
  onClear,
  acceptRestored,
  ttlMs = LOCAL_DRAFT_TTL_MS,
}: UseLocalDraftBackupOptions<T>): LocalDraftController {
  const [state, setState] = useState<LocalDraftPersistenceState>('loading');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readyRef = useRef(false);
  const skipInitialSaveRef = useRef(false);
  const lastSerializedRef = useRef<string | null>(null);
  const callbacksRef = useRef({ validate, hasContent, onRestore, onClear, acceptRestored });

  useEffect(() => {
    callbacksRef.current = { validate, hasContent, onRestore, onClear, acceptRestored };
  }, [acceptRestored, hasContent, onClear, onRestore, validate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const callbacks = callbacksRef.current;
      const storage = getBrowserStorage();

      skipInitialSaveRef.current = true;
      readyRef.current = true;

      if (!storage) {
        setState('error');
        setSavedAt(null);
        setError('El navegador bloqueó el almacenamiento local.');
        return;
      }

      const result = readLocalDraft(storage, key, callbacks.validate);

      if (result.ok) {
        if (callbacks.acceptRestored && !callbacks.acceptRestored(result.value)) {
          removeLocalDraft(storage, key);
          setState('empty');
          setSavedAt(null);
          return;
        }

        callbacks.onRestore(result.value);
        lastSerializedRef.current = JSON.stringify(result.value);
        setState('restored');
        setSavedAt(result.savedAt);
        setError(null);
        return;
      }

      setState(result.reason === 'storage-error' ? 'error' : 'empty');
      setSavedAt(null);
      setError(
        result.reason === 'storage-error' ? 'El navegador bloqueó el almacenamiento local.' : null,
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const callbacks = callbacksRef.current;
      const storage = getBrowserStorage();
      if (!storage) {
        setState('error');
        setError('El navegador bloqueó el almacenamiento local.');
        return;
      }
      if (!callbacks.hasContent(value)) {
        removeLocalDraft(storage, key);
        lastSerializedRef.current = null;
        setState('empty');
        setSavedAt(null);
        setError(null);
        return;
      }

      let serialized: string;
      try {
        serialized = JSON.stringify(value);
      } catch {
        setState('error');
        setError('El borrador no pudo serializarse de forma segura.');
        return;
      }
      if (serialized === lastSerializedRef.current) return;

      const result = writeLocalDraft(storage, key, value, Date.now(), ttlMs);
      if (!result.ok) {
        setState('error');
        setError(
          result.reason === 'too-large'
            ? 'El borrador supera el tamaño local permitido.'
            : 'No se pudo guardar el borrador en este navegador.',
        );
        return;
      }

      lastSerializedRef.current = serialized;
      setState('saved');
      setSavedAt(result.savedAt);
      setError(null);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [key, ttlMs, value]);

  const clear = useCallback(() => {
    const storage = getBrowserStorage();
    const removed = storage ? removeLocalDraft(storage, key) : false;
    callbacksRef.current.onClear();
    lastSerializedRef.current = null;
    setState(removed ? 'empty' : 'error');
    setSavedAt(null);
    setError(removed ? null : 'No se pudo eliminar el borrador local.');
  }, [key]);

  return { state, savedAt, error, clear };
}
