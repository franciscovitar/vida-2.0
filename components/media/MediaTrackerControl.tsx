'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { mediaTrackerStates } from '@/lib/media/intake';
import type { MediaTitleView } from '@/types/media';

import styles from './MediaTrackerControl.module.scss';

interface MediaTrackerControlProps {
  item: MediaTitleView;
  onSaved?: () => void;
}

function localToday(): string {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return value;
  const latin = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (latin) {
    return `${latin[3]}-${String(latin[2]).padStart(2, '0')}-${String(latin[1]).padStart(2, '0')}`;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const parsed = new Date(timestamp);
  return `${String(parsed.getUTCFullYear()).padStart(4, '0')}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

function canShowRewatchToggle(item: MediaTitleView): boolean {
  if (item.state === 'Reveer') return true;
  return item.medium === 'movie' ? item.state === 'Vista' : item.state === 'Terminada';
}

export function MediaTrackerControl({ item, onSaved }: MediaTrackerControlProps) {
  const router = useRouter();
  const states = mediaTrackerStates(item.medium).filter(
    (option) => option !== 'Reveer' || item.state === 'Reveer',
  );
  const initialState = states.includes(item.state)
    ? item.state
    : item.medium === 'movie'
      ? 'Vista'
      : 'Viendo';
  const [state, setState] = useState(initialState);
  const [date, setDate] = useState(dateInputValue(item.observedDate) || localToday());
  const [rating, setRating] = useState(item.rating === null ? '' : String(item.rating));
  const [comment, setComment] = useState(item.personalOpinion ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date) return;
    const numericRating = rating.trim() ? Number(rating.replace(',', '.')) : null;
    if (
      numericRating !== null &&
      (!Number.isFinite(numericRating) || numericRating < 0 || numericRating > 10)
    ) {
      setError(true);
      return;
    }

    setSaving(true);
    setError(false);
    try {
      const response = await fetch('/api/media/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: item.key,
          medium: item.medium,
          state,
          date,
          rating: numericRating,
          comment: comment || null,
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
      onSaved?.();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleRewatch() {
    setSaving(true);
    setError(false);
    try {
      const response = await fetch('/api/media/rewatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: item.key,
          medium: item.medium,
          enabled: item.state !== 'Reveer',
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
      onSaved?.();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.tracker} aria-label="Tracker personal">
      <div className={styles.heading}>
        <div>
          <h3>Mi tracker</h3>
          <p>
            Guardá el estado real, la fecha y lo que te dejó. Reveer se activa aparte y sólo cuando
            el título ya fue visto o terminado; tu nota, fecha y observaciones se conservan.
          </p>
        </div>
      </div>

      {canShowRewatchToggle(item) ? (
        <div className={styles.footer}>
          <button type="button" disabled={saving} onClick={() => void toggleRewatch()}>
            {saving
              ? 'Guardando…'
              : item.state === 'Reveer'
                ? 'Sacar de Reveer'
                : 'Marcar para Reveer'}
          </button>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <div className={styles.grid}>
          <label>
            <span>Estado</span>
            <select
              value={state}
              disabled={saving}
              onChange={(event) => setState(event.target.value)}
            >
              {states.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fecha</span>
            <input
              type="date"
              required
              value={date}
              disabled={saving}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            <span>{item.medium === 'series' ? 'Mi nota general' : 'Mi nota'}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Opcional · 0–10"
              value={rating}
              disabled={saving}
              onChange={(event) => setRating(event.target.value)}
            />
          </label>
        </div>

        <label className={styles.comment}>
          <span>Observaciones</span>
          <textarea
            rows={3}
            maxLength={5000}
            placeholder="Qué te gustó, qué no, sensaciones, ritmo, actuaciones…"
            value={comment}
            disabled={saving}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>

        <div className={styles.footer}>
          <button type="submit" disabled={saving || !date}>
            {saving ? 'Guardando…' : 'Guardar en tracker'}
          </button>
          {error ? (
            <p>
              No se pudo confirmar el guardado completo. La nota debe estar entre 0 y 10; podés usar
              cualquier decimal con coma o punto.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
