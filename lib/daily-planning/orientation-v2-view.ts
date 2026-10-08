import type { DailyPlanningContext } from '@/types/daily-planning-intelligence';
import type {
  DailyOrientationFocusItem,
  DailyOrientationSnapshotRead,
  DailyOrientationView,
} from '@/types/daily-orientation-v2';

function assessmentRefExists(context: DailyPlanningContext, ref: string): boolean {
  return (context.assessments ?? []).some(
    (assessment) => assessment.assessmentId === ref || assessment.subjectId === ref,
  );
}

function attentionRefExists(
  context: DailyPlanningContext,
  targetKind: string,
  ref: string | null,
): boolean {
  if (!ref) return true;
  switch (targetKind) {
    case 'task':
      return context.tasks.some((task) => task.id === ref);
    case 'project':
      return context.projects.some((project) => project.id === ref);
    case 'assessment':
    case 'subject':
      return assessmentRefExists(context, ref);
    default:
      return false;
  }
}

function upcomingRefExists(
  context: DailyPlanningContext,
  kind: string,
  ref: string | null,
): boolean {
  if (!ref) return true;
  switch (kind) {
    case 'task':
      return context.tasks.some((task) => task.id === ref);
    case 'project':
      return context.projects.some((project) => project.id === ref);
    case 'assessment':
      return assessmentRefExists(context, ref);
    case 'calendar':
      return context.calendarEvents.some((event) => event.id === ref);
    default:
      return false;
  }
}

function focusRefExists(context: DailyPlanningContext, item: DailyOrientationFocusItem): boolean {
  if (!item.ref) return true;
  switch (item.domain) {
    case 'tasks':
      return context.tasks.some((task) => task.id === item.ref);
    case 'projects':
    case 'professional':
      return context.projects.some((project) => project.id === item.ref);
    case 'university':
      return assessmentRefExists(context, item.ref);
    default:
      return false;
  }
}

export function buildDailyOrientationV2View(
  context: DailyPlanningContext,
  read: DailyOrientationSnapshotRead,
): DailyOrientationView {
  const snapshot = read.snapshot;
  let unresolvedRefs = 0;

  const attention =
    snapshot?.payload.attention.flatMap((item) => {
      if (!attentionRefExists(context, item.targetKind, item.ref)) {
        unresolvedRefs += 1;
        return [];
      }
      return [
        {
          domain: item.domain,
          targetKind: item.targetKind,
          title: item.title,
          recommendation: item.recommendation,
          why: item.why,
          confidence: item.confidence,
          nextAction: item.nextAction,
        },
      ];
    }) ?? [];

  const upcoming =
    snapshot?.payload.upcoming.flatMap((item) => {
      if (!upcomingRefExists(context, item.kind, item.ref)) {
        unresolvedRefs += 1;
        return [];
      }
      return [
        {
          kind: item.kind,
          title: item.title,
          date: item.date,
          dateType: item.dateType,
          reason: item.reason,
        },
      ];
    }) ?? [];

  const resolveFocus = (items: readonly DailyOrientationFocusItem[]) =>
    items.flatMap((item) => {
      if (!focusRefExists(context, item)) {
        unresolvedRefs += 1;
        return [];
      }
      return [{ domain: item.domain, title: item.title, why: item.why }];
    });

  let status: DailyOrientationView['status'];
  if (!snapshot) {
    status =
      context.status === 'unavailable'
        ? 'unavailable'
        : read.status === 'empty'
          ? 'empty'
          : 'degraded';
  } else if (context.status !== 'ready' || read.status !== 'ready' || unresolvedRefs > 0) {
    status = 'degraded';
  } else {
    status = 'ready';
  }

  let notice = read.notice;
  if (unresolvedRefs > 0) {
    notice = `${notice ? `${notice} ` : ''}${unresolvedRefs} referencia(s) V2 ya no pudieron resolverse contra las fuentes actuales.`;
  } else if (context.status === 'degraded' && !notice) {
    notice = 'La orientación V2 se muestra con fuentes actuales parcialmente degradadas.';
  }

  return {
    status,
    notice,
    targetDate: context.targetDate,
    generatedAt: snapshot?.generatedAt ?? null,
    review: snapshot?.payload.review ?? null,
    attention,
    upcoming,
    lifeSignals: snapshot?.payload.lifeSignals ?? [],
    minimum: snapshot ? resolveFocus(snapshot.payload.minimum) : [],
    notNow: snapshot ? resolveFocus(snapshot.payload.notNow) : [],
    quality: {
      unresolvedRefs,
      invalidRows: read.invalidRows,
    },
  };
}
