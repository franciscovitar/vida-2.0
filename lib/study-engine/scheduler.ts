import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type CardInput,
  type FSRSParameters,
  type Grade,
  type StateType,
} from 'ts-fsrs';

export const STUDY_ENGINE_SCHEDULER = 'fsrs' as const;
export const STUDY_ENGINE_SCHEDULER_LIBRARY_VERSION = '5.4.2';
export const STUDY_ENGINE_FSRS_ALGORITHM_VERSION = 'FSRS-6.0';
export const STUDY_ENGINE_FSRS_PARAMETERS_VERSION = 'study-engine-fsrs-v1';

export const STUDY_ENGINE_FSRS_PARAMETERS = {
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
    0.0912, 0.0658, 0.1542,
  ],
} as const satisfies FSRSParameters;

export type StudyRating = 'again' | 'hard' | 'good' | 'easy';

export interface StudySchedulerState {
  dueAt: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: StateType;
  lastReview: string | null;
}

export interface SchedulerMetadata {
  scheduler: typeof STUDY_ENGINE_SCHEDULER;
  schedulerLibraryVersion: string;
  algorithmVersion: string;
  parameterVersion: string;
  desiredRetention: number;
}

export interface SchedulerTransition {
  rating: StudyRating;
  state: StudySchedulerState;
}

export interface SchedulerInterface {
  metadata(): SchedulerMetadata;
  createInitialState(now: Date): StudySchedulerState;
  preview(state: StudySchedulerState, now: Date): Record<StudyRating, SchedulerTransition>;
  review(state: StudySchedulerState, now: Date, rating: StudyRating): SchedulerTransition;
  retrievability(state: StudySchedulerState, now: Date): number;
}

function stateName(state: State): StateType {
  switch (state) {
    case State.New:
      return 'New';
    case State.Learning:
      return 'Learning';
    case State.Review:
      return 'Review';
    case State.Relearning:
      return 'Relearning';
  }
}

function stateValue(state: StateType): State {
  switch (state) {
    case 'New':
      return State.New;
    case 'Learning':
      return State.Learning;
    case 'Review':
      return State.Review;
    case 'Relearning':
      return State.Relearning;
  }
}

function gradeFor(rating: StudyRating): Grade {
  switch (rating) {
    case 'again':
      return Rating.Again;
    case 'hard':
      return Rating.Hard;
    case 'good':
      return Rating.Good;
    case 'easy':
      return Rating.Easy;
  }
}

function fromCard(card: Card): StudySchedulerState {
  return {
    dueAt: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: stateName(card.state),
    lastReview: card.last_review?.toISOString() ?? null,
  };
}

function toCard(state: StudySchedulerState): CardInput {
  return {
    due: state.dueAt,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: stateValue(state.state),
    last_review: state.lastReview,
  };
}

function transition(rating: StudyRating, card: Card): SchedulerTransition {
  return { rating, state: fromCard(card) };
}

export function ratingRepresentsSuccessfulRecall(rating: StudyRating): boolean {
  return rating !== 'again';
}

export class FsrsScheduler implements SchedulerInterface {
  private readonly engine = fsrs(STUDY_ENGINE_FSRS_PARAMETERS);

  metadata(): SchedulerMetadata {
    return {
      scheduler: STUDY_ENGINE_SCHEDULER,
      schedulerLibraryVersion: STUDY_ENGINE_SCHEDULER_LIBRARY_VERSION,
      algorithmVersion: STUDY_ENGINE_FSRS_ALGORITHM_VERSION,
      parameterVersion: STUDY_ENGINE_FSRS_PARAMETERS_VERSION,
      desiredRetention: STUDY_ENGINE_FSRS_PARAMETERS.request_retention,
    };
  }

  createInitialState(now: Date): StudySchedulerState {
    return fromCard(createEmptyCard(now));
  }

  preview(
    state: StudySchedulerState,
    now: Date,
  ): Record<StudyRating, SchedulerTransition> {
    const preview = this.engine.repeat(toCard(state), now);
    return {
      again: transition('again', preview[Rating.Again].card),
      hard: transition('hard', preview[Rating.Hard].card),
      good: transition('good', preview[Rating.Good].card),
      easy: transition('easy', preview[Rating.Easy].card),
    };
  }

  review(
    state: StudySchedulerState,
    now: Date,
    rating: StudyRating,
  ): SchedulerTransition {
    const result = this.engine.next(toCard(state), now, gradeFor(rating));
    return transition(rating, result.card);
  }

  retrievability(state: StudySchedulerState, now: Date): number {
    return this.engine.get_retrievability(toCard(state), now, false);
  }
}
