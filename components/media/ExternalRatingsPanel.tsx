'use client';

import { useEffect, useState } from 'react';

import type { MediaExternalRatingsView } from '@/lib/media/external-ratings';

import styles from './ExternalRatingsPanel.module.scss';

type PanelState =
  | { status: 'loading' }
  | { status: 'ready'; data: MediaExternalRatingsView }
  | { status: 'empty' }
  | { status: 'unavailable' };

interface ExternalRatingsPanelProps {
  itemKey: string;
}

const sessionCache = new Map<string, MediaExternalRatingsView>();

function score(value: number): string {
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

export function ExternalRatingsPanel({ itemKey }: ExternalRatingsPanelProps) {
  const [state, setState] = useState<PanelState>(() => {
    const cached = sessionCache.get(itemKey);
    return cached ? { status: 'ready', data: cached } : { status: 'loading' };
  });

  useEffect(() => {
    const cached = sessionCache.get(itemKey);
    if (cached) {
      setState({ status: 'ready', data: cached });
      return undefined;
    }

    setState({ status: 'loading' });
    const controller = new AbortController();

    void fetch(`/api/media/external-ratings?key=${encodeURIComponent(itemKey)}`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 503) return null;
          throw new Error('external-ratings-unavailable');
        }
        return (await response.json()) as { ok?: boolean; data?: MediaExternalRatingsView };
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (!payload) {
          setState({ status: 'unavailable' });
          return;
        }
        if (!payload.ok || !payload.data) throw new Error('external-ratings-invalid');
        if (payload.data.ratings.length === 0) {
          setState({ status: 'empty' });
          return;
        }
        sessionCache.set(itemKey, payload.data);
        setState({ status: 'ready', data: payload.data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'unavailable' });
      });

    return () => controller.abort();
  }, [itemKey]);

  if (state.status === 'unavailable') return null;

  return (
    <section className={styles.panel} aria-label="Notas externas">
      <div className={styles.heading}>
        <div>
          <h3>Notas externas</h3>
          <p>Comparación normalizada a 10.</p>
        </div>
        {state.status === 'ready' && state.data.average !== null ? (
          <div className={styles.average}>
            <span>Promedio</span>
            <strong>{score(state.data.average)}</strong>
            <small>{state.data.ratings.length} fuentes</small>
          </div>
        ) : null}
      </div>

      {state.status === 'loading' ? (
        <p className={styles.notice}>Consultando puntuaciones…</p>
      ) : null}

      {state.status === 'empty' ? (
        <p className={styles.notice}>Todavía no hay puntuaciones externas suficientes.</p>
      ) : null}

      {state.status === 'ready' ? (
        <div className={styles.grid}>
          {state.data.ratings.map((rating) => (
            <div key={rating.source} className={styles.rating}>
              <span>{rating.label}</span>
              <strong>{score(rating.score)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
