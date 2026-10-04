'use client';

import { useState, useTransition } from 'react';

import { saveWorldFeedbackAction } from '@/app/actions/world-feedback';
import type {
  WorldFeedbackSnapshot,
  WorldFeedbackValue,
} from '@/lib/world/feedback';

import styles from './World.module.scss';

const OPTIONS: readonly { value: WorldFeedbackValue; label: string }[] = [
  { value: 'USEFUL', label: 'Útil' },
  { value: 'ALREADY_KNEW', label: 'Ya lo sabía' },
  { value: 'WANT_DEEPER', label: 'Quiero profundizar' },
  { value: 'NOT_RELEVANT', label: 'No me interesa' },
  { value: 'TOO_BASIC', label: 'Muy básico' },
  { value: 'TOO_DETAILED', label: 'Muy detallado' },
];

export function WorldFeedback({
  briefId,
  snapshot,
}: {
  briefId: string;
  snapshot: WorldFeedbackSnapshot;
}) {
  const [selected, setSelected] = useState<WorldFeedbackValue | null>(
    snapshot.feedback?.feedback ?? null,
  );
  const [message, setMessage] = useState<string | null>(snapshot.notice);
  const [pending, startTransition] = useTransition();

  function choose(value: WorldFeedbackValue) {
    if (!snapshot.writable || pending || value === selected) return;

    setMessage(null);
    startTransition(async () => {
      const result = await saveWorldFeedbackAction({ briefId, feedback: value });
      if (result.ok) {
        setSelected(result.record.feedback);
        setMessage(result.corrected ? 'Actualizado.' : 'Guardado.');
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <section className={styles['feedback-card']} aria-labelledby="world-feedback-title">
      <div className={styles['feedback-copy']}>
        <strong id="world-feedback-title">¿Cómo estuvo esta pieza?</strong>
        <p>
          Una respuesta alcanza. Ajusta selección y profundidad con señales repetidas; un click
          aislado no cambia tu perfil.
        </p>
      </div>

      <div className={styles['feedback-options']} role="group" aria-label="Feedback de World">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles['feedback-button']}
            data-selected={selected === option.value ? 'true' : 'false'}
            disabled={!snapshot.writable || pending}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className={styles['feedback-status']} aria-live="polite">
        {message ??
          (!snapshot.writable
            ? 'Feedback temporalmente no disponible.'
            : selected
              ? 'Podés cambiar tu respuesta cuando quieras.'
              : '')}
      </p>
    </section>
  );
}
