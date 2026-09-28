'use client';

import { Check, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import {
  createStudyAttemptEvent,
  latestAttemptForReviewUnit,
} from '@/lib/study-engine/attempt-store';
import {
  attachStudyReconnectSync,
  type StudyReconnectController,
} from '@/lib/study-engine/browser-sync';
import {
  getOrCreateStudyDeviceId,
  IndexedDbAttemptOutboxStore,
} from '@/lib/study-engine/browser-attempt-store';
import { HttpStudyAttemptTransport } from '@/lib/study-engine/http-attempt-transport';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SafeRichContent } from '@/components/study-engine/SafeRichContent';
import {
  evaluateStudyResponse,
  selectStudySessionItems,
  studyReviewUnitId,
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
const attemptStore = new IndexedDbAttemptOutboxStore();
const attemptTransport = new HttpStudyAttemptTransport();

const OPERATION_LABELS: Record<StudyItem['operation'], string> = {
  recall: 'Recordar',
  explain: 'Explicar',
  discriminate: 'Distinguir',
  apply: 'Aplicar',
  select: 'Elegir',
  calculate: 'Calcular',
  interpret: 'Interpretar',
};

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

function deriveAttemptFreshness(
  item: StudyItem,
  seenBefore: boolean,
  schedulerState: StudySchedulerState,
  now: Date,
) {
  if (item.intendedFreshness === 'delayed' && schedulerState.lastReview) {
    const elapsed = now.getTime() - Date.parse(schedulerState.lastReview);
    if (Number.isFinite(elapsed) && elapsed >= 86_400_000) return 'delayed' as const;
  }
  if (seenBefore) return 'familiar' as const;
  return item.intendedFreshness ?? 'familiar';
}

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
  disabled = false,
}: {
  correctness: boolean | null;
  onRate: (rating: StudyRating) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.ratings} aria-label="Calificá tu recuperación">
      {RATINGS.map((rating) => {
        const ratingDisabled = disabled || (correctness === false && rating.value !== 'again');
        return (
          <button
            key={rating.value}
            type="button"
            className={styles.rating}
            data-rating={rating.value}
            disabled={ratingDisabled}
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

export function StudySession({
  items = STUDY_ENGINE_DEMO_ITEMS,
  modeLabel = 'Demo funcional',
}: {
  items?: readonly StudyItem[];
  modeLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [sessionDateKey] = useState(() => new Date().toISOString().slice(0, 10));
  const sessionItems = useMemo(
    () => selectStudySessionItems(items, sessionDateKey),
    [items, sessionDateKey],
  );
  const [response, setResponse] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [correctness, setCorrectness] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState<SessionAttempt[]>([]);
  const schedulerStates = useRef(new Map<string, StudySchedulerState>());
  const sessionId = useRef<string | null>(null);
  const shownAtMs = useRef<number | null>(null);
  const savingRef = useRef(false);
  const reconnectSync = useRef<StudyReconnectController | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'pending' | 'conflict'
  >('idle');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncFailure, setSyncFailure] = useState<string | null>(null);
  useEffect(() => {
    shownAtMs.current = Date.now();
  }, [index]);

  useEffect(() => {
    const controller = attachStudyReconnectSync(attemptStore, attemptTransport);
    reconnectSync.current = controller;
    return () => {
      controller.dispose();
      reconnectSync.current = null;
    };
  }, []);

  async function flushRemoteOutbox() {
    const controller = reconnectSync.current;
    if (!controller) return;

    setSyncStatus('syncing');
    setSyncFailure(null);
    const result = await controller.flushNow();
    setPendingSyncCount(result.remaining);

    if (result.stoppedOn === 'conflict') {
      setSyncStatus('conflict');
      return;
    }

    if (result.remaining > 0) {
      setSyncStatus('pending');
      setSyncFailure(attemptTransport.getLastFailure());
      return;
    }

    setSyncStatus('synced');
    setSyncFailure(null);
  }

  const completed = index >= sessionItems.length;
  const item = completed ? null : sessionItems[index];

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

  async function rate(rating: StudyRating) {
    if (!item || savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setSyncStatus('idle');
    setPendingSyncCount(0);
    setSyncFailure(null);

    try {
      const now = new Date();
      const persistedAttempts = await attemptStore.listAttempts();
      const reviewUnitId = studyReviewUnitId(item);
      const latestPersisted = latestAttemptForReviewUnit(persistedAttempts, reviewUnitId);
      const seenBefore = Boolean(latestPersisted);
      const currentState =
        schedulerStates.current.get(reviewUnitId) ??
        latestPersisted?.schedulerStateAfter ??
        scheduler.createInitialState(now);
      const transition = scheduler.review(currentState, now, rating);
      const successful = correctness ?? ratingRepresentsSuccessfulRecall(rating);
      const attemptId = crypto.randomUUID();

      sessionId.current ??= crypto.randomUUID();

      const attempt = createStudyAttemptEvent({
        id: attemptId,
        idempotencyKey: attemptId,
        sessionId: sessionId.current,
        studyItemId: item.id,
        itemVersion: item.version,
        reviewUnitId,
        subjectId: item.subjectId,
        conceptId: item.conceptId,
        facetId: item.facetId ?? null,
        variantFamily: item.variantFamily ?? null,
        modeRole: item.modeRole ?? null,
        interaction: item.interaction ?? null,
        evidenceCeiling: item.evidenceCeiling ?? null,
        operation: item.operation,
        channel: item.channel ?? 'theoretical',
        shownAt: new Date(shownAtMs.current ?? now.getTime()).toISOString(),
        answeredAt: now.toISOString(),
        response: item.itemType === 'recall' ? null : response,
        correctness: successful,
        rating,
        learnerConfidence: null,
        helpLevel: 'independent',
        seenBefore,
        contextFreshness: deriveAttemptFreshness(item, seenBefore, currentState, now),
        schedulerStateBefore: currentState,
        schedulerStateAfter: transition.state,
        deviceId: getOrCreateStudyDeviceId(),
      });

      await attemptStore.persistAttempt(attempt);
      void flushRemoteOutbox();

      schedulerStates.current.set(reviewUnitId, transition.state);
      setAttempts((current) => [
        ...current,
        {
          itemId: item.id,
          rating,
          successful,
          scheduledDays: transition.state.scheduledDays,
        },
      ]);
      setIndex((current) => current + 1);
      setResponse('');
      setRevealed(false);
      setCorrectness(null);
      shownAtMs.current = Date.now();
    } catch {
      setSaveError(
        'No pudimos guardar este intento en el dispositivo. La pregunta no avanzó; podés reintentar.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function reset() {
    setIndex(0);
    setResponse('');
    setRevealed(false);
    setCorrectness(null);
    setAttempts([]);
    schedulerStates.current = new Map();
    sessionId.current = null;
    shownAtMs.current = Date.now();
    setSaveError(null);
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
          <h2>
            {successCount} de {attempts.length} recuperaciones salieron
          </h2>
          <p className={styles.muted}>
            El intento se guarda primero en este dispositivo y se sincroniza con el backend cuando
            hay conexión. El scheduler conserva su estado dentro del evento del intento.
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
          Repetir sesión
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
          <span className={styles['demo-badge']}>{modeLabel}</span>
          <span>{TYPE_LABELS[item.itemType]}</span>
          <span>
            {index + 1}/{sessionItems.length}
          </span>
        </div>
        <ProgressBar
          value={progress}
          max={sessionItems.length}
          domain="learning"
          label={'Progreso de sesión: ' + (index + 1) + ' de ' + sessionItems.length}
        />
        <div className={styles['session-info']}>
          <span className={styles['local-status']}>
            <Check size={14} aria-hidden="true" />
            Guardado local
          </span>
          <div className={styles['sync-cluster']}>
            <span className={styles['sync-status']} data-status={syncStatus}>
              {syncStatus === 'idle' ? 'Sync listo' : null}
              {syncStatus === 'syncing' ? 'Sincronizando…' : null}
              {syncStatus === 'synced' ? 'Sincronizado' : null}
              {syncStatus === 'pending'
                ? pendingSyncCount + ' pendiente(s)' + (syncFailure ? ' · ' + syncFailure : '')
                : null}
              {syncStatus === 'conflict' ? 'Conflicto de sync' : null}
            </span>
            {syncStatus === 'pending' || syncStatus === 'conflict' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconLeft={RefreshCw}
                onClick={() => void flushRemoteOutbox()}
              >
                Reintentar
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Card className={styles['question-card']}>
        <div className={styles['question-meta']}>
          <span>{OPERATION_LABELS[item.operation]}</span>
        </div>

        {item.itemType === 'image' ? <StudyVisual visual={item.visual} /> : null}

        {item.promptContent?.length ? <SafeRichContent blocks={item.promptContent} /> : null}

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
            data-result={correctness === null ? 'manual' : correctness ? 'correct' : 'wrong'}
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
            {item.richContent?.length ? (
              <details className={styles['rich-details']}>
                <summary>Ver contenido enriquecido</summary>
                <SafeRichContent blocks={item.richContent} />
              </details>
            ) : null}
            <div className={styles['rating-header']}>
              <span>¿Cómo te fue?</span>
            </div>
            <RatingButtons correctness={correctness} onRate={rate} disabled={saving} />
            {saving ? (
              <p className={styles['persistence-note']}>Guardando intento en este dispositivo…</p>
            ) : null}
            {saveError ? (
              <p className={styles['save-error']} role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
