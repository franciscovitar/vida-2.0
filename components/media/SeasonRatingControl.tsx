'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import styles from './SeasonRatingControl.module.scss';

interface SeasonRatingControlProps {
  itemKey: string;
  seasonNumber: number;
  rating: number | null;
  onSaved?: () => void;
}

export function SeasonRatingControl({
  itemKey,
  seasonNumber,
  rating,
  onSaved,
}: SeasonRatingControlProps) {
  const router = useRouter();
  const [value, setValue] = useState(rating === null ? '' : String(rating));
  const [savedRating, setSavedRating] = useState<number | null>(rating);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericRating = value.trim() ? Number(value.replace(',', '.')) : null;
    if (
      numericRating !== null &&
      (!Number.isFinite(numericRating) || numericRating < 0 || numericRating > 10)
    ) {
      setError(true);
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      const response = await fetch('/api/media/season-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: itemKey,
          seasonNumber,
          rating: numericRating,
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setSavedRating(numericRating);
      setSaved(true);
      router.refresh();
      onSaved?.();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label>
        <span>{savedRating === null ? 'Mi nota · Sin registrar' : 'Mi nota'}</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0–10"
          value={value}
          disabled={saving}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          aria-label={`Mi nota para temporada ${seasonNumber}`}
        />
      </label>
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : savedRating === null ? 'Puntuar' : 'Guardar'}
      </button>
      {error ? <small>No se pudo confirmar la nota. Revisá que esté entre 0 y 10.</small> : null}
      {saved && !error ? <small className={styles.success}>Nota guardada.</small> : null}
    </form>
  );
}
