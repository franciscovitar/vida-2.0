/**
 * Diffs sanitizados por tipo de acción (sin secretos ni IDs de proveedor).
 */
import type {
  ActionDiff,
  CalendarHoldCreatePayload,
  GymSessionCreatePayload,
  InboxCapturePayload,
  TaskChangeStatusPayload,
  TaskCreatePayload,
} from '@/types/actions';

function field(
  name: string,
  before: string | number | boolean | null,
  after: string | number | boolean | null,
) {
  return { field: name, before, after };
}

export function buildTaskCreateDiff(after: TaskCreatePayload): ActionDiff {
  return {
    fields: [
      field('title', null, after.title),
      field('priority', null, after.priority),
      field('areaKey', null, after.areaKey),
      field('status', null, 'Pendiente'),
    ],
  };
}

export function buildTaskChangeStatusDiff(
  beforeStatus: string,
  payload: TaskChangeStatusPayload,
): ActionDiff {
  return {
    fields: [field('status', beforeStatus, payload.nextStatus)],
  };
}

export function buildInboxCaptureDiff(payload: InboxCapturePayload): ActionDiff {
  return {
    fields: [
      field('text', null, payload.text.slice(0, 120)),
      field('origin', null, payload.origin),
      field('hasLink', null, Boolean(payload.link)),
    ],
  };
}

export function buildGymSessionDiff(payload: GymSessionCreatePayload): ActionDiff {
  return {
    fields: [
      field('date', null, payload.date),
      field('routineKey', null, payload.routineKey),
      field('workoutDayKey', null, payload.workoutDayKey),
      field('sets', null, payload.sets.length),
    ],
  };
}

export function buildCalendarHoldDiff(payload: CalendarHoldCreatePayload): ActionDiff {
  return {
    fields: [
      field('title', null, payload.title),
      field('start', null, payload.start),
      field('end', null, payload.end),
    ],
  };
}

export function digestFromDiff(diff: ActionDiff): string {
  const canonical = JSON.stringify(diff.fields);
  let hash = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash * 31 + canonical.charCodeAt(i)) >>> 0;
  }
  return `diff-${hash.toString(16)}`;
}
