import type { DailyPlanningContext } from '@/types/daily-planning-intelligence';
import type {
  DailyOrientationFocusItem,
  DailyOrientationUpcomingItem,
  DailyOrientationSnapshotRead,
  DailyOrientationView,
} from '@/types/daily-orientation-v2';

function assessmentRefExists(context: DailyPlanningContext, ref: string): boolean {
  if (context.sources.assessments?.available !== true) return false;
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
      return context.sources.tasks.available && context.tasks.some((task) => task.id === ref);
    case 'project':
      return (
        context.sources.projects.available && context.projects.some((project) => project.id === ref)
      );
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
      return context.sources.tasks.available && context.tasks.some((task) => task.id === ref);
    case 'project':
      return (
        context.sources.projects.available && context.projects.some((project) => project.id === ref)
      );
    case 'assessment':
      return assessmentRefExists(context, ref);
    case 'calendar':
      return (
        context.sources.calendar.available &&
        context.calendarEvents.some((event) => event.id === ref)
      );
    default:
      return false;
  }
}

/**
 * A reference still existing is not enough to establish that the date in a
 * persisted orientation remains current. Prefer the live source's date.
 * Unreferenced suggestions retain their explicitly unverified transport
 * semantics; no date authority is inferred from a null ref.
 */
function upcomingDateAgrees(
  context: DailyPlanningContext,
  item: DailyOrientationUpcomingItem,
): boolean {
  if (!item.ref) return true;

  switch (item.kind) {
    case 'calendar': {
      // Calendar proves that an event exists, not that it is an official deadline.
      if (item.dateType !== 'event' && item.dateType !== 'unknown') return false;
      const event = context.calendarEvents.find((candidate) => candidate.id === item.ref);
      return (
        event !== undefined &&
        event.status !== 'cancelled' &&
        item.date >= event.startDate &&
        item.date <= event.endDate
      );
    }
    case 'assessment': {
      if (item.dateType !== 'assessment' && item.dateType !== 'unknown') return false;
      // Subject-level aliases are acceptable only when they uniquely resolve.
      const assessments = (context.assessments ?? []).filter(
        (candidate) => candidate.assessmentId === item.ref || candidate.subjectId === item.ref,
      );
      return assessments.length === 1 && assessments[0]?.assessmentDate === item.date;
    }
    case 'task': {
      const task = context.tasks.find((candidate) => candidate.id === item.ref);
      if (!task || !task.date || task.date !== item.date) return false;

      const expected =
        item.dateType === 'deadline'
          ? 'deadline'
          : item.dateType === 'target'
            ? 'target'
            : item.dateType === 'review'
              ? 'review'
              : null;
      // A legacy date with no semantics cannot certify a deadline.
      return (
        (expected === null && item.dateType === 'unknown') ||
        (expected !== null && task.dateSemantics === expected)
      );
    }
    case 'project': {
      const project = context.projects.find((candidate) => candidate.id === item.ref);
      if (!project) return false;
      if (item.dateType === 'review') return project.reviewDate === item.date;
      if (item.dateType === 'deadline' || item.dateType === 'target') {
        return project.dueDate === item.date;
      }
      return (
        item.dateType === 'unknown' &&
        (project.reviewDate === item.date || project.dueDate === item.date)
      );
    }
    default:
      return false;
  }
}

function focusRefExists(context: DailyPlanningContext, item: DailyOrientationFocusItem): boolean {
  if (!item.ref) return true;
  switch (item.domain) {
    case 'tasks':
      return context.sources.tasks.available && context.tasks.some((task) => task.id === item.ref);
    case 'projects':
    case 'professional':
      return (
        context.sources.projects.available &&
        context.projects.some((project) => project.id === item.ref)
      );
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
  let dateConflicts = 0;

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
      if (!upcomingDateAgrees(context, item)) {
        dateConflicts += 1;
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
  } else if (
    context.status !== 'ready' ||
    read.status !== 'ready' ||
    unresolvedRefs > 0 ||
    dateConflicts > 0
  ) {
    status = 'degraded';
  } else {
    status = 'ready';
  }

  let notice = read.notice;
  if (unresolvedRefs > 0) {
    notice = `${notice ? `${notice} ` : ''}${unresolvedRefs} referencia(s) V2 ya no pudieron resolverse contra las fuentes actuales.`;
  }
  if (dateConflicts > 0) {
    notice = `${notice ? `${notice} ` : ''}${dateConflicts} fecha(s) V2 ya no coinciden con la fuente actual y se ocultaron para evitar urgencias incorrectas.`;
  }
  if (context.status === 'degraded' && !notice) {
    notice = 'La orientación V2 se muestra con fuentes actuales parcialmente degradadas.';
  }

  return {
    status,
    readStatus: read.status,
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
      dateConflicts,
      invalidRows: read.invalidRows,
    },
  };
}
