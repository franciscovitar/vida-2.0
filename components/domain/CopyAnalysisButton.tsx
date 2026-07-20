'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/Button';

import styles from './CopyAnalysisButton.module.scss';

export function CopyAnalysisButton({ text }: { text: string }) {
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'error'>('idle');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('copied');
      window.setTimeout(() => setFeedback('idle'), 2000);
    } catch {
      setFeedback('error');
      window.setTimeout(() => setFeedback('idle'), 2500);
    }
  }

  return (
    <div className={styles.wrap}>
      <Button type="button" variant="secondary" size="sm" iconLeft={Copy} onClick={handleCopy}>
        Copiar análisis para ChatGPT
      </Button>
      {feedback === 'copied' ? (
        <span className={styles.ok} role="status">
          <Check size={12} aria-hidden="true" /> Copiado
        </span>
      ) : null}
      {feedback === 'error' ? (
        <span className={styles.err} role="status">
          Error al copiar
        </span>
      ) : null}
    </div>
  );
}
