import type { RhythmStabilityResult } from './rhythm';
import type { RhythmDriveWindowRead } from './rhythm-drive-source-core';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_WINDOW_DAYS = 7;

export interface RhythmPreviewCheckSummary {
  ok: boolean;
  sourceStatus: RhythmDriveWindowRead['status'];
  sourceCode: string | null;
  daysRequested: number;
  normalizedDays: number;
  sleepUsableDays: number;
  activityUsableDays: number;
  readyDays: number;
  partialDays: number;
  preservedDays: number;
  missingDays: number;
  unavailableDays: number;
  invalidDays: number;
  scoreState: 'available' | 'insufficient';
  calculationVersion: RhythmStabilityResult['calculationVersion'];
}

function parseDay(value: string): Date | null {
  const match = DAY_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function buildRhythmPreviewDates(
  endDay: string,
  count = DEFAULT_WINDOW_DAYS,
): string[] | null {
  const end = parseDay(endDay);
  if (!end || !Number.isInteger(count) || count < 1 || count > 14) return null;

  const dates: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getTime() - offset * 86_400_000);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

export function summarizeRhythmPreviewCheck(
  read: RhythmDriveWindowRead,
  score: RhythmStabilityResult,
  daysRequested: number,
): RhythmPreviewCheckSummary {
  const count = (status: RhythmDriveWindowRead['reads'][number]['status']) =>
    read.reads.filter((item) => item.status === status).length;

  return {
    ok: read.status !== 'unavailable',
    sourceStatus: read.status,
    sourceCode: read.code,
    daysRequested,
    normalizedDays: read.days.length,
    sleepUsableDays: read.input.sleep.length,
    activityUsableDays: read.input.activity?.length ?? 0,
    readyDays: count('ready'),
    partialDays: count('partial'),
    preservedDays: count('preserved'),
    missingDays: count('missing'),
    unavailableDays: count('unavailable'),
    invalidDays: count('invalid'),
    scoreState: score.score === null ? 'insufficient' : 'available',
    calculationVersion: score.calculationVersion,
  };
}
