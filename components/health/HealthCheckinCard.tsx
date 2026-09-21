'use client';

import { useState, useTransition } from 'react';

import { saveHealthCheckinAction } from '@/app/actions/health-checkin';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { HEALTH_CHECKIN_NOTE_MAX, type HealthCheckin } from '@/lib/health/checkin';

import styles from './HealthCheckinCard.module.scss';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  targetDate: string;
  initial: HealthCheckin | null;
  writable: boolean;
  notice: string | null;
};

function Segmented({
  label,
  value,
  min,
  max,
  optional = false,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  optional?: boolean;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);

  return (
    <fieldset className={styles.field} disabled={disabled}>
      <legend>{label}</legend>
      <div className={styles.segments}>
        {values.map((item) => (
          <button
            key={item}
            type="button"
            className={styles.segment}
            data-selected={value === item ? 'true' : 'false'}
            aria-pressed={value === item}
            onClick={() => onChange(optional && value === item ? null : item)}
          >
            {item}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function HealthCheckinCard({ targetDate, initial, writable, notice }: Props) {
  const [energy, setEnergy] = useState<number | null>(initial?.energy ?? null);
  const [rested, setRested] = useState<number | null>(initial?.rested ?? null);
  const [soreness, setSoreness] = useState<number | null>(initial?.soreness ?? null);
  const [stress, setStress] = useState<number | null>(initial?.stress ?? null);
  const [focus, setFocus] = useState<number | null>(initial?.focus ?? null);
  const [workoutRpe, setWorkoutRpe] = useState<number | null>(initial?.workoutRpe ?? null);
  const [unwell, setUnwell] = useState<boolean | null>(initial?.unwell ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [savedOnce, setSavedOnce] = useState(Boolean(initial));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [feedback, setFeedback] = useState<string | null>(
    initial ? 'Hoy ya está guardado. Podés corregirlo y volver a guardar.' : null,
  );
  const [, startTransition] = useTransition();

  const defaultComplete = energy !== null && rested !== null && soreness !== null;
  const disabled = !writable || saveState === 'saving';

  const submit = () => {
    if (!writable) return;
    if (!defaultComplete) {
      setSaveState('error');
      setFeedback('Completá Energía, Descansado y Agujetas / dolor muscular.');
      return;
    }

    setSaveState('saving');
    setFeedback('Guardando…');

    startTransition(() => {
      void (async () => {
        const result = await saveHealthCheckinAction({
          targetDate,
          energy,
          rested,
          soreness,
          stress,
          focus,
          workoutRpe,
          unwell,
          note: note.trim() === '' ? null : note.trim(),
          operationId: crypto.randomUUID(),
        });

        if (!result.ok) {
          setSaveState('error');
          setFeedback(result.message);
          return;
        }

        setEnergy(result.checkin.energy);
        setRested(result.checkin.rested);
        setSoreness(result.checkin.soreness);
        setStress(result.checkin.stress);
        setFocus(result.checkin.focus);
        setWorkoutRpe(result.checkin.workoutRpe);
        setUnwell(result.checkin.unwell);
        setNote(result.checkin.note ?? '');
        setSavedOnce(true);
        setSaveState('saved');
        setFeedback(
          result.replay
            ? 'Ya estaba guardado con estos valores.'
            : result.corrected
              ? 'Corrección guardada.'
              : 'Check-in guardado.',
        );
      })();
    });
  };

  return (
    <Card aria-labelledby="health-checkin-title">
      <SectionHeader
        id="health-checkin-title"
        title="¿Cómo estás hoy?"
        description="Tres respuestas rápidas para calibrar Salud con tu experiencia real."
        domain="health"
      />

      {!writable ? (
        <p className={styles.notice} role="status">
          {notice ?? 'Health Check-in no está disponible en este entorno.'}
        </p>
      ) : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className={styles.defaults}>
            <Segmented
              label="Energía"
              value={energy}
              min={1}
              max={5}
              disabled={disabled}
              onChange={setEnergy}
            />
            <Segmented
              label="Descansado"
              value={rested}
              min={1}
              max={5}
              disabled={disabled}
              onChange={setRested}
            />
            <Segmented
              label="Agujetas / dolor muscular"
              value={soreness}
              min={1}
              max={5}
              disabled={disabled}
              onChange={setSoreness}
            />
          </div>

          <details className={styles.more}>
            <summary>Más</summary>
            <div className={styles.optional}>
              <Segmented
                label="Stress"
                value={stress}
                min={1}
                max={5}
                optional
                disabled={disabled}
                onChange={setStress}
              />
              <Segmented
                label="Focus"
                value={focus}
                min={1}
                max={5}
                optional
                disabled={disabled}
                onChange={setFocus}
              />
              <Segmented
                label="Workout RPE"
                value={workoutRpe}
                min={1}
                max={10}
                optional
                disabled={disabled}
                onChange={setWorkoutRpe}
              />

              <fieldset className={styles.field} disabled={disabled}>
                <legend>Unwell</legend>
                <div className={styles.segments}>
                  <button
                    type="button"
                    className={styles.segment}
                    data-selected={unwell === false ? 'true' : 'false'}
                    aria-pressed={unwell === false}
                    onClick={() => setUnwell(unwell === false ? null : false)}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    className={styles.segment}
                    data-selected={unwell === true ? 'true' : 'false'}
                    aria-pressed={unwell === true}
                    onClick={() => setUnwell(unwell === true ? null : true)}
                  >
                    Sí
                  </button>
                </div>
              </fieldset>

              <label className={styles.note}>
                <span>Note</span>
                <textarea
                  value={note}
                  maxLength={HEALTH_CHECKIN_NOTE_MAX}
                  disabled={disabled}
                  rows={3}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
            </div>
          </details>

          <div className={styles.footer}>
            <div>
              {feedback ? (
                <p
                  className={styles.feedback}
                  data-state={saveState}
                  role={saveState === 'error' ? 'alert' : 'status'}
                >
                  {feedback}
                </p>
              ) : (
                <p className={styles.hint}>No se guarda nada hasta que presiones Guardar.</p>
              )}
              {savedOnce ? (
                <small>Una corrección posterior reemplaza el registro de hoy.</small>
              ) : null}
            </div>
            <button type="submit" className={styles.save} disabled={disabled || !defaultComplete}>
              {saveState === 'saving' ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}