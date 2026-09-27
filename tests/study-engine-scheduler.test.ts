import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FsrsScheduler,
  ratingRepresentsSuccessfulRecall,
  STUDY_ENGINE_FSRS_PARAMETERS,
  STUDY_ENGINE_FSRS_PARAMETERS_VERSION,
  STUDY_ENGINE_SCHEDULER_LIBRARY_VERSION,
  type StudyRating,
} from '@/lib/study-engine/scheduler';

const START = new Date('2022-12-29T12:30:00.000Z');

test('Study Engine pins the FSRS library and parameter set', () => {
  const scheduler = new FsrsScheduler();
  assert.deepEqual(scheduler.metadata(), {
    scheduler: 'fsrs',
    schedulerLibraryVersion: '5.4.2',
    algorithmVersion: 'FSRS-6.0',
    parameterVersion: 'study-engine-fsrs-v1',
    desiredRetention: 0.9,
  });
  assert.equal(STUDY_ENGINE_SCHEDULER_LIBRARY_VERSION, '5.4.2');
  assert.equal(STUDY_ENGINE_FSRS_PARAMETERS_VERSION, 'study-engine-fsrs-v1');
  assert.equal(STUDY_ENGINE_FSRS_PARAMETERS.enable_fuzz, false);
  assert.equal(STUDY_ENGINE_FSRS_PARAMETERS.w.length, 21);
});

test('first-review preview matches the pinned FSRS-6 golden vector', () => {
  const scheduler = new FsrsScheduler();
  const initial = scheduler.createInitialState(START);
  const preview = scheduler.preview(initial, START);
  const order: StudyRating[] = ['again', 'hard', 'good', 'easy'];

  assert.deepEqual(
    order.map((rating) => preview[rating].state.stability),
    [0.212, 1.2931, 2.3065, 8.2956],
  );
  assert.deepEqual(
    order.map((rating) => preview[rating].state.difficulty),
    [6.4133, 5.11217071, 2.11810397, 1],
  );
  assert.deepEqual(
    order.map((rating) => preview[rating].state.scheduledDays),
    [0, 0, 0, 8],
  );
  assert.deepEqual(
    order.map((rating) => preview[rating].state.state),
    ['Learning', 'Learning', 'Learning', 'Review'],
  );
});

test('golden review history remains deterministic with fuzz disabled', () => {
  const scheduler = new FsrsScheduler();
  const ratings: StudyRating[] = [
    'good',
    'good',
    'good',
    'good',
    'good',
    'good',
    'again',
    'again',
    'good',
    'good',
    'good',
    'good',
    'good',
  ];
  const expectedIntervals = [0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21];

  let state = scheduler.createInitialState(START);
  let now = START;
  const intervals: number[] = [];

  for (const rating of ratings) {
    const result = scheduler.review(state, now, rating);
    state = result.state;
    intervals.push(state.scheduledDays);
    now = new Date(state.dueAt);
  }

  assert.deepEqual(intervals, expectedIntervals);
});

test('serialized scheduler state produces the same next transition', () => {
  const scheduler = new FsrsScheduler();
  const initial = scheduler.createInitialState(START);
  const first = scheduler.review(initial, START, 'good').state;
  const persisted = JSON.parse(JSON.stringify(first)) as typeof first;
  const nextAt = new Date(first.dueAt);

  assert.deepEqual(
    scheduler.review(persisted, nextAt, 'good'),
    scheduler.review(first, nextAt, 'good'),
  );
});

test('Again is failed recall while Hard remains successful recall', () => {
  assert.equal(ratingRepresentsSuccessfulRecall('again'), false);
  assert.equal(ratingRepresentsSuccessfulRecall('hard'), true);
  assert.equal(ratingRepresentsSuccessfulRecall('good'), true);
  assert.equal(ratingRepresentsSuccessfulRecall('easy'), true);
});
