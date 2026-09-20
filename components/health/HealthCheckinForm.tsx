'use client';

import { useState, useTransition, type FormEvent } from 'react';

import { saveHealthCheckinAction } from '@/app/actions/health-checkin';
import type { HealthCheckinDraft, HealthCheckinSnapshot } from '@/lib/health/checkin';

import styles from './HealthCheckinForm.module.scss';

type NumericField = 'energy' | 'rested' | 'soreness' | 'stress' | 'focus' | 'workoutRpe';
type SaveState = 'idle' | 'saved' | 'error';

function emptyDraft(): HealthCheckinDraft {
  return {
    energy: null,
    rested: null,
    soreness: null,
    stress: null,
    focus: null,
    workoutRpe: null,
    unwell: null,
    note: null,
  };
}

function initialDraft(initial: HealthCheckinSnapshot): HealthCheckinDraft {
  return initial.values ? { ...initial.values } : emptyDraft();
}

function ScaleControl({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className={styles.field} disabled={disabled}>
      <legend>{label}</legend>
      <div className={styles.scale} aria-label={`${label}: escala de 1 a 5`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            className={styles['scale-button']}
            aria-pressed={value === score}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function HealthCheckinForm({ initial }: { initial: HealthCheckinSnapshot }) {
  const [draft, setDraft] = useState<HealthCheckinDraft>(() => initialDraft(initial));
  const [saved, setSaved] = useState(initial.saved);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [feedback, setFeedback] = useState<string | null>(initial.notice);
  const [isPending, startTransition] = useTransition();

  const setNumeric = (field: NumericField, value: number | null) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveState('idle');
    setFeedback(null);
  };

  const requiredReady =
    draft.energy !== null && draft.rested !== null && draft.soreness !== null;
  const disabled = !initial.canWrite || isPending;
  const canSubmit = initial.canWrite && requiredReady && !isPending;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setFeedback(null);
    startTransition(() => {
      void (async () => {
        const result = await saveHealthCheckinAction(draft);
        if (!result.ok) {
          setSaveState('error');
          setFeedback(result.message);
          return;
        }

        setDraft({ ...result.values });
        setSaved(true);
        setSaveState('saved');
        setFeedback(
          result.replay
            ? 'Este check-in ya estaba guardado con esos valores.'
            : 'Guardado. Si después querés corregir algo de hoy, podés editarlo y volver a guardar.',
        );
      })();
    });
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.topline}>
        <p>1 = bajo · 5 = alto</p>
        {saved ? <span className={styles.saved}>Guardado hoy</span> : null}
      </div>

      <div className={styles.defaults}>
        <ScaleControl
          label="Energía"
          value={draft.energy}
          onChange={(value) => setNumeric('energy', value)}
          disabled={disabled}
        />
        <ScaleControl
          label="Descansado"
          value={draft.rested}
          onChange={(value) => setNumeric('rested', value)}
          disabled={disabled}
        />
        <ScaleControl
          label="Agujetas / dolor muscular"
          value={draft.soreness}
          onChange={(value) => setNumeric('soreness', value)}
          disabled={disabled}
        />
      </div>

      <details className={styles.more}>
        <summary>Más</summary>
        <div className={styles.optional}>
          <ScaleControl
            label="Stress"
            value={draft.stress}
            onChange={(value) => setNumeric('stress', value)}
            disabled={disabled}
          />
          <ScaleControl
            label="Focus"
            value={draft.focus}
            onChange={(value) => setNumeric('focus', value)}
            disabled={disabled}
          />

          <label className={styles['select-field']}>
            <span>Workout RPE</span>
            <select
              value={draft.workoutRpe ?? ''}
              disabled={disabled}
              onChange={(event) =>
                setNumeric(
                  'workoutRpe',
                  event.target.value === '' ? null : Number(event.target.value),
                )
              }
            >
              <option value="">Sin responder</option>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </label>

          <label className={styles['select-field']}>
            <span>Unwell</span>
            <select
              value={draft.unwell === null || draft.unwell === undefined ? '' : String(draft.unwell)}
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value;
                setDraft((current) => ({
                  ...current,
                  unwell: value === '' ? null : value === 'true',
                }));
                setSaveState('idle');
                setFeedback(null);
              }}
            >
              <option value="">Sin responder</option>
              <option value="false">No</option>
              <option value="true">Sí</option>
            </select>
          </label>

          <label className={styles['note-field']}>
            <span>Nota</span>
            <textarea
              value={draft.note ?? ''}
              disabled={disabled}
              maxLength={280}
              rows={3}
              placeholder="Opcional"
              onChange={(event) => {
                setDraft((current) => ({ ...current, note: event.target.value || null }));
                setSaveState('idle');
                setFeedback(null);
              }}
            />
          </label>
        </div>
      </details>

      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {isPending ? 'Guardando…' : saved ? 'Guardar corrección' : 'Guardar check-in'}
        </button>
        {!requiredReady && initial.canWrite ? (
          <span>Completá Energía, Descansado y Agujetas / dolor muscular.</span>
        ) : null}
      </div>

      {feedback ? (
        <p className={styles.feedback} data-state={saveState} role="status">
          {feedback}
        </p>
      ) : null}
      {!initial.canWrite && initial.state === 'ready' && !feedback ? (
        <p className={styles.feedback} role="status">
          El guardado está deshabilitado en este entorno.
        </p>
      ) : null}
    </form>
  );
}
