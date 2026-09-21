'use client';

import { useState, useTransition } from 'react';

import { saveIntelligenceFeedbackAction } from '@/app/actions/intelligence-feedback';
import type { IntelligenceFeedbackValue } from '@/lib/intelligence/feedback';

import styles from './IntelligenceDashboard.module.scss';

const OPTIONS: readonly { value: IntelligenceFeedbackValue; label: string }[] = [
  { value: 'USEFUL', label: 'Me sirvió' },
  { value: 'ALREADY_KNEW', label: 'Ya lo sabía' },
  { value: 'TOO_BASIC', label: 'Muy básico' },
  { value: 'TOO_DETAILED', label: 'Muy detallado' },
  { value: 'NOT_RELEVANT', label: 'No me interesa' },
  { value: 'WANT_DEEPER', label: 'Quiero profundizar' },
];

export function IntelligenceFeedback({
  articleId,
  initialValue,
  writable,
}: {
  articleId: string;
  initialValue: IntelligenceFeedbackValue | null;
  writable: boolean;
}) {
  const [selected, setSelected] = useState<IntelligenceFeedbackValue | null>(initialValue);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(value: IntelligenceFeedbackValue) {
    if (!writable || pending || value === selected) return;

    setMessage(null);
    startTransition(async () => {
      const result = await saveIntelligenceFeedbackAction({ articleId, feedback: value });
      if (result.ok) {
        setSelected(result.record.feedback);
        setMessage(result.corrected ? 'Actualizado.' : 'Guardado.');
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <section className={styles['feedback-card']} aria-labelledby="intelligence-feedback-title">
      <div className={styles['feedback-copy']}>
        <strong id="intelligence-feedback-title">¿Cómo estuvo este artículo?</strong>
        <p>Una respuesta alcanza. Sirve para ajustar qué temas entran y con qué profundidad.</p>
      </div>

      <div className={styles['feedback-options']} role="group" aria-label="Feedback del artículo">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles['feedback-button']}
            data-selected={selected === option.value ? 'true' : 'false'}
            disabled={!writable || pending}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className={styles['feedback-status']} aria-live="polite">
        {message ?? (!writable ? 'Feedback temporalmente no disponible.' : selected ? 'Podés cambiar tu respuesta cuando quieras.' : '')}
      </p>
    </section>
  );
}
