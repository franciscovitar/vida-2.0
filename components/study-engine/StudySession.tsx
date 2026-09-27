'use client';

import { Check, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  evaluateStudyResponse,
  STUDY_ENGINE_DEMO_ITEMS,
  type StudyItem,
  type StudyVisualKey,
} from '@/lib/study-engine/items';
import {
  FsrsScheduler,
  ratingRepresentsSuccessfulRecall,
  type StudyRating,
  type StudySchedulerState,
} from '@/lib/study-engine/scheduler';

import styles from './StudySession.module.scss';

interface SessionAttempt {
  itemId: string;
  rating: StudyRating;
  successful: boolean;
  scheduledDays: number;
}

const scheduler = new FsrsScheduler();

const TYPE_LABELS: Record<StudyItem['itemType'], string> = {
  recall: 'Recuperación',
  cloze: 'Completar',
  mcq: 'Multiple choice',
  typed: 'Respuesta escrita',
  image: 'Diagrama',
};

const RATINGS: readonly {
  value: StudyRating;
  label: string;
  hint: string;
}[] = [
  { value: 'again', label: 'Otra vez', hint: 'No salió' },
  { value: 'hard', label: 'Difícil', hint: 'Salió con esfuerzo' },
  { value: 'good', label: 'Bien', hint: 'Recuerdo normal' },
  { value: 'easy', label: 'Fácil', hint: 'Muy fluido' },
];

function StudyVisual({ visual }: { visual: StudyVisualKey }) {
  if (visual === 'ownership') {
    return (
      <div
        className={styles.visual}
        role="img"
        aria-label="Tarjeta existente en Anki, evidencia hacia Learning OS y práctica complementaria en Study Engine"
      >
        <span className={styles['visual-node']}>ANKI</span>
        <span className={styles['visual-arrow']} aria-hidden="true">
          →
        </span>
        <span className={styles['visual-node']}>Learning OS</span>
        <span className={styles['visual-arrow']} aria-hidden="true">
          ←
        </span>
        <span className={styles['visual-node']}>Study Engine</span>
      </div>
    );
  }

  return (
    <div
      className={styles['evidence-visual']}
      role="img"
      aria-label="Escalera de evidencia desde familiar hacia fresh y transfer"
    >
      <span>Familiar</span>
      <span>Fresh</span>
      <span>Transfer</span>
    </div>
  );
}

function ObjectiveInput({
  item,
  response,
  onResponse,
  onSubmit,
}: {
  item: Exclude<StudyItem, { itemType: 'recall' }>;
  response: string;
  onResponse: (value: string) => void;
  onSubmit: () => void;
}) {
  if (item.itemType === 'mcq') {
    return (
      <fieldset className={styles.options}>
        <legend className="visually-hidden">Elegí una respuesta</legend>
        {item.options.map((option) => (
          <label
            key={option.id}
            className={styles.option}
            data-selected={response === option.id ? 'true' : 'false'}
          >
            <input
              type="radio"
              name={item.id}
              value={option.id}
              checked={response === option.id}
              onChange={(event) => onResponse(event.target.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
        <Button type="button" variant="primary" onClick={onSubmit} disabled={!response}>
          Comprobar
        </Button>
      </fieldset>
    );
  }

  return (
    <div className={styles['text-answer']}>
      <label htmlFor={'study-response-' + item.id}>Tu respuesta</label>
      <input
        id={'study-response-' + item.id}
        value={response}
        placeholder={item.placeholder ?? 'Escribí tu respuesta...'}
        autoComplete="off"
        onChange={(event) => onResponse(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && response.trim()) onSubmit();
        }}
      />
      <Button type="button" variant="primary" onClick={onSubmit} disabled={!response.trim()}>
        Comprobar
      </Button>
    </div>
  );
}

function RatingButtons({
  correctness,
  onRate,
}: {
  correctness: boolean | null;
  onRate: (rating: StudyRating) => void;
}) {
  return (
    <div className={styles.ratings} aria-label="Calificá tu recuperación">
      {RATINGS.map((rating) => {
        const disabled = correctness === false && rating.value !== 'again';
        return (
          <button
            key={rating.value}
            type="button"
            className={styles.rating}
            data-rating={rating.value}
            disabled={disabled}
            onClick={() => onRate(rating.value)}
          >
            <strong>{rating.label}</strong>
            <span>{rating.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StudySession() {
  const items = STUDY_ENGINE_DEMO_ITEMS;
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [correctness, setCorrectness] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState<SessionAttempt[]>([]);
  const schedulerStates = useRef(new Map<string, StudySchedulerState>());
  const completed = index >= items.length;
  const item = completed ? null : items[index];

  const successCount = useMemo(
    () => attempts.filter((attempt) => attempt.successful).length,
    [attempts],
  );

  function revealRecall() {
    setCorrectness(null);
    setRevealed(true);
  }

  function checkObjective() {
    if (!item || item.itemType === 'recall') return;
    setCorrectness(evaluateStudyResponse(item, response));
    setRevealed(true);
  }

  function rate(rating: StudyRating) {
    if (!item) return;

    const now = new Date();
    const currentState =
      schedulerStates.current.get(item.id) ?? scheduler.createInitialState(now);
    const transition = scheduler.review(currentState, now, rating);
    schedulerStates.current.set(item.id, transition.state);

    setAttempts((current) => [
      ...current,
      {
        itemId: item.id,
        rating,
        successful: correctness ?? ratingRepresentsSuccessfulRecall(rating),
        scheduledDays: transition.state.scheduledDays,
      },
    ]);
    setIndex((current) => current + 1);
    setResponse('');
    setRevealed(false);
    setCorrectness(null);
  }

  function reset() {
    setIndex(0);
    setResponse('');
    setRevealed(false);
    setCorrectness(null);
    setAttempts([]);
    schedulerStates.current = new Map();
  }

  if (completed) {
    const scheduled = attempts.filter((attempt) => attempt.scheduledDays > 0);
    const nearest = scheduled.length
      ? Math.min(...scheduled.map((attempt) => attempt.scheduledDays))
      : 0;

    return (
      <Card className={styles.complete}>
        <div className={styles['complete-icon']} aria-hidden="true">
          <Check size={24} />
        </div>
        <div>
          <p className={styles.eyebrow}>Sesión terminada</p>
          <h2>{successCount} de {attempts.length} recuperaciones salieron</h2>
          <p className={styles.muted}>
            El scheduler ya calculó el próximo estado de cada review unit. En esta demo todavía no
            se persiste al cerrar la página.
          </p>
        </div>
        <div className={styles['summary-grid']}>
          <div>
            <strong>{attempts.length}</strong>
            <span>intentos</span>
          </div>
          <div>
            <strong>{nearest === 0 ? 'Hoy' : nearest + ' d'}</strong>
            <span>repaso más cercano</span>
          </div>
        </div>
        <Button type="button" variant="primary" iconLeft={RefreshCw} onClick={reset}>
          Repetir demo
        </Button>
      </Card>
    );
  }

  if (!item) return null;

  const progress = index + (revealed ? 0.6 : 0);

  return (
    <div className={styles.session}>
      <div className={styles['session-header']}>
        <div className={styles['status-row']}>
          <span className={styles['demo-badge']}>Demo funcional</span>
          <span>{TYPE_LABELS[item.itemType]}</span>
          <span>
            {index + 1}/{items.length}
          </span>
        </div>
        <ProgressBar
          value={progress}
          max={items.length}
          domain="learning"
          label={'Progreso de sesión: ' + (index + 1) + ' de ' + items.length}
        />
        <p className={styles['persistence-note']}>
          Esta etapa prueba el flujo real y FSRS. La persistencia/offline llega en un hito
          posterior.
        </p>
      </div>

      <Card className={styles['question-card']}>
        <div className={styles['question-meta']}>
          <span>{item.operation}</span>
          <span>{item.conceptId}</span>
        </div>

        {item.itemType === 'image' ? <StudyVisual visual={item.visual} /> : null}

        <h2 className={styles.prompt}>{item.prompt}</h2>

        {!revealed && item.itemType === 'recall' ? (
          <Button type="button" variant="primary" onClick={revealRecall}>
            Mostrar respuesta
          </Button>
        ) : null}

        {!revealed && item.itemType !== 'recall' ? (
          <ObjectiveInput
            item={item}
            response={response}
            onResponse={setResponse}
            onSubmit={checkObjective}
          />
        ) : null}

        {revealed ? (
          <div
            className={styles.feedback}
            data-result={
              correctness === null
                ? 'manual'
                : correctness
                  ? 'correct'
                  : 'wrong'
            }
          >
            <div className={styles['feedback-title']}>
              {correctness === true ? <Check size={18} aria-hidden="true" /> : null}
              {correctness === false ? <X size={18} aria-hidden="true" /> : null}
              <strong>
                {correctness === null
                  ? 'Compará con tu respuesta'
                  : correctness
                    ? 'Correcto'
                    : 'No salió esta vez'}
              </strong>
            </div>
            <p className={styles.answer}>{item.answer}</p>
            <p className={styles.explanation}>{item.explanation}</p>
            <div className={styles['rating-header']}>
              <span>¿Cómo fue la recuperación?</span>
              <ChevronRight size={16} aria-hidden="true" />
            </div>
            <RatingButtons correctness={correctness} onRate={rate} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
