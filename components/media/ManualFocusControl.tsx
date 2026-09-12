'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { MediaFocusLevel, MediaKind } from '@/types/media';

import styles from './ManualFocusControl.module.scss';

interface ManualFocusControlProps {
  itemKey: string;
  medium: MediaKind;
  state: string;
  value: MediaFocusLevel | null;
  defaultLevel?: MediaFocusLevel;
}

export function ManualFocusControl({
  itemKey,
  medium,
  state,
  value,
  defaultLevel = 1,
}: ManualFocusControlProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<MediaFocusLevel | null>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  if (state !== 'Por ver') return null;

  async function save(next: MediaFocusLevel | null) {
    setSaving(true);
    setError(false);
    try {
      const response = await fetch('/api/media/manual-focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: itemKey, medium, level: next }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setSelected(next);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const checked = selected !== null;

  return (
    <div className={styles.control}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={checked}
          disabled={saving}
          onChange={(event) => void save(event.target.checked ? defaultLevel : null)}
        />
        <span>Prioritaria para mí</span>
      </label>

      {checked ? (
        <select
          className={styles.select}
          value={selected ?? defaultLevel}
          disabled={saving}
          aria-label="Lote prioritario"
          onChange={(event) => void save(Number(event.target.value) as MediaFocusLevel)}
        >
          <option value={1}>Lote 1</option>
          <option value={2}>Lote 2</option>
          <option value={3}>Lote 3</option>
        </select>
      ) : null}

      {saving ? <p className={styles.status}>Guardando…</p> : null}
      {error ? (
        <p className={`${styles.status} ${styles.error}`}>No se pudo guardar la prioridad.</p>
      ) : null}
    </div>
  );
}
