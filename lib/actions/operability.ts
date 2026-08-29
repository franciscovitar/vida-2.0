/**
 * Matriz de operabilidad read-only de las cinco acciones de negocio.
 * Sin IDs, secretos, URLs ni payloads.
 */
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { BUSINESS_ACTION_TYPES } from '@/lib/actions/policy';
import type {
  CalendarHoldWritePort,
  GymSheetWritePort,
  NotionInboxWritePort,
  NotionTaskWritePort,
} from '@/lib/actions/ports';
import type { ProposedBusinessActionType } from '@/types/actions';

export type OperabilityState = 'ready' | 'blocked' | 'misconfigured';

export type BusinessActionOperability = {
  actionType: ProposedBusinessActionType;
  state: OperabilityState;
  issues: string[];
};

export type WriteOperabilityMatrix = {
  global: OperabilityState | 'disabled';
  actions: BusinessActionOperability[];
};

export type OperabilityDeps = {
  tasks: NotionTaskWritePort;
  inbox: NotionInboxWritePort;
  gym: GymSheetWritePort;
  calendar?: CalendarHoldWritePort;
};

function disabledMatrix(): WriteOperabilityMatrix {
  return {
    global: 'disabled',
    actions: BUSINESS_ACTION_TYPES.map((actionType) => ({
      actionType,
      state: 'blocked' as const,
      issues: ['writes-disabled'],
    })),
  };
}

export async function buildWriteOperabilityMatrix(
  deps: OperabilityDeps,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<WriteOperabilityMatrix> {
  if (!isWriteActionsEnabled(env)) {
    return disabledMatrix();
  }

  const actions: BusinessActionOperability[] = [];

  const inboxReady = await deps.inbox.checkReady();
  actions.push({
    actionType: 'inbox.capture',
    state: inboxReady.ok
      ? 'ready'
      : inboxReady.code === 'misconfigured'
        ? 'misconfigured'
        : 'blocked',
    issues: inboxReady.ok ? [] : [inboxReady.code],
  });

  const tasksReady = await deps.tasks.checkReady();
  if (!tasksReady.ok) {
    actions.push({
      actionType: 'task.create',
      state: tasksReady.code === 'misconfigured' ? 'misconfigured' : 'blocked',
      issues: [tasksReady.code],
    });
    actions.push({
      actionType: 'task.change-status',
      state: tasksReady.code === 'misconfigured' ? 'misconfigured' : 'blocked',
      issues: [tasksReady.code],
    });
  } else {
    actions.push({
      actionType: 'task.create',
      state: tasksReady.hasAuthorizedArea ? 'ready' : 'blocked',
      issues: tasksReady.hasAuthorizedArea ? [] : ['no-authorized-area'],
    });
    actions.push({
      actionType: 'task.change-status',
      state: tasksReady.hasTasks ? 'ready' : 'blocked',
      issues: tasksReady.hasTasks ? [] : ['no-task-fixture'],
    });
  }

  const gymReady = await deps.gym.checkReady();
  actions.push({
    actionType: 'gym.session.create',
    state: gymReady.ok ? 'ready' : gymReady.code === 'misconfigured' ? 'misconfigured' : 'blocked',
    issues: gymReady.ok ? [] : [gymReady.code],
  });

  const calendarReady = deps.calendar
    ? await deps.calendar.checkReady()
    : ({
        ok: false as const,
        code: 'not-configured' as const,
        message: 'Calendario no configurado.',
      } as const);
  actions.push({
    actionType: 'calendar.hold.create',
    state: calendarReady.ok
      ? 'ready'
      : calendarReady.code === 'misconfigured'
        ? 'misconfigured'
        : 'blocked',
    issues: calendarReady.ok ? [] : [calendarReady.code],
  });

  const hardFailures = actions.filter(
    (row) =>
      row.state === 'misconfigured' ||
      (row.state === 'blocked' && !row.issues.includes('no-task-fixture')),
  );
  const hasMisconfigured = actions.some((row) => row.state === 'misconfigured');

  let global: WriteOperabilityMatrix['global'] = 'ready';
  if (hasMisconfigured) global = 'misconfigured';
  else if (hardFailures.length > 0) global = 'blocked';
  else global = 'ready';

  return { global, actions };
}

export function isActionOperable(
  matrix: WriteOperabilityMatrix,
  actionType: ProposedBusinessActionType,
): boolean {
  if (matrix.global === 'disabled') return false;
  const row = matrix.actions.find((item) => item.actionType === actionType);
  return row?.state === 'ready';
}
