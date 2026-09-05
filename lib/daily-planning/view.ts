import type { DailyPlanningContext, DailyPlanningCalendarEvent } from '@/types/daily-planning-intelligence';
import type {
  DailyPlanSnapshotItem,
  DailyPlanSnapshotRead,
  DailyPlanningDateMarkerView,
  DailyPlanningSourceView,
  DailyPlanningView,
  DailyPlanningViewItem,
} from '@/types/daily-planning-view';

function taskMeta(task: DailyPlanningContext['tasks'][number]): string | null {
  const parts: string[] = [];
  if (task.priority) parts.push(`Prioridad ${task.priority}`);
  if (task.duration) parts.push(task.duration);
  if (task.date) parts.push(`Fecha ${task.date}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function calendarMeta(event: DailyPlanningCalendarEvent): string | null {
  if (event.allDay) return `Fecha ${event.startDate}`;
  if (event.startTime && event.endTime) return `${event.startTime}–${event.endTime}`;
  return event.startTime;
}

function resolveItem(
  item: DailyPlanSnapshotItem,
  context: DailyPlanningContext,
): DailyPlanningViewItem | null {
  if (item.kind === 'derived') {
    return {
      title: item.activity ?? 'Recomendación derivada',
      reason: item.reason,
      meta: 'Recomendación derivada',
    };
  }

  if (!item.ref) return null;
  if (item.kind === 'task') {
    const task = context.tasks.find((candidate) => candidate.id === item.ref);
    if (!task) return null;
    return { title: task.title, reason: item.reason, meta: taskMeta(task) };
  }
  if (item.kind === 'project') {
    const project = context.projects.find((candidate) => candidate.id === item.ref);
    if (!project) return null;
    const progress = project.progress === null ? null : `${project.progress.percent}%`;
    const meta = [project.status, progress].filter(Boolean).join(' · ') || null;
    return { title: project.name, reason: item.reason, meta };
  }

  const event = context.calendarEvents.find((candidate) => candidate.id === item.ref);
  if (!event) return null;
  return { title: event.title, reason: item.reason, meta: calendarMeta(event) };
}

function markerNote(event: DailyPlanningCalendarEvent): string | null {
  if (event.evidence.dateConflict) return 'Conflicto de fecha detectado';
  switch (event.evidence.provenance) {
    case 'user-confirmed':
      return 'Fecha confirmada por vos';
    case 'official-source':
      return 'Fuente oficial';
    case 'schedule-derived':
      return 'Derivada de cronograma';
    case 'probable':
      return 'Fecha probable';
    default:
      return null;
  }
}

function isOnDate(event: DailyPlanningCalendarEvent, date: string): boolean {
  return event.startDate <= date && event.endDate >= date;
}

function sourceViews(
  context: DailyPlanningContext,
  snapshotRead: DailyPlanSnapshotRead,
): DailyPlanningSourceView[] {
  return [
    {
      label: 'Plan',
      status: snapshotRead.status,
      available: snapshotRead.status !== 'unavailable',
      notice: snapshotRead.notice,
    },
    {
      label: 'Tareas',
      status: context.sources.tasks.status,
      available: context.sources.tasks.available,
      notice: context.sources.tasks.notice,
    },
    {
      label: 'Proyectos',
      status: context.sources.projects.status,
      available: context.sources.projects.available,
      notice: context.sources.projects.notice,
    },
    {
      label: 'Hitos',
      status: context.sources.milestones.status,
      available: context.sources.milestones.available,
      notice: context.sources.milestones.notice,
    },
    {
      label: 'Calendar',
      status: context.sources.calendar.status,
      available: context.sources.calendar.available,
      notice: context.sources.calendar.notice,
    },
  ];
}

/** Combina recomendación persistida con verdad factual actual sin re-priorizar. */
export function buildDailyPlanningView(
  context: DailyPlanningContext,
  snapshotRead: DailyPlanSnapshotRead,
): DailyPlanningView {
  const snapshot = snapshotRead.snapshot;
  let unresolvedPlanRefs = 0;

  const resolveList = (items: readonly DailyPlanSnapshotItem[]): DailyPlanningViewItem[] => {
    const resolved: DailyPlanningViewItem[] = [];
    for (const item of items) {
      const view = resolveItem(item, context);
      if (view) resolved.push(view);
      else unresolvedPlanRefs += 1;
    }
    return resolved;
  };

  const must = snapshot ? resolveList(snapshot.payload.must) : [];
  const should = snapshot ? resolveList(snapshot.payload.should) : [];
  const could = snapshot ? resolveList(snapshot.payload.could) : [];
  const notToday = snapshot ? resolveList(snapshot.payload.notToday) : [];
  const minimumViable = snapshot ? resolveList(snapshot.payload.minimumViable) : [];
  const suggestedBlocks = snapshot
    ? snapshot.payload.suggestedBlocks.flatMap((block) => {
        const item = resolveItem(block.item, context);
        if (!item) {
          unresolvedPlanRefs += 1;
          return [];
        }
        return [{ start: block.start, end: block.end, item }];
      })
    : [];

  const fixedCommitments = context.calendarEvents
    .filter(
      (event) => event.planningRole === 'capacity-block' && isOnDate(event, context.targetDate),
    )
    .map((event) => ({
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
    }));

  const dateMarkers: DailyPlanningDateMarkerView[] = context.calendarEvents
    .filter((event) => event.planningRole !== 'capacity-block')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5)
    .map((event) => ({ title: event.title, date: event.startDate, note: markerNote(event) }));

  const blockedTasks = context.tasks
    .filter((task) => task.status === 'Bloqueada')
    .map((task) => ({ title: task.title, blocker: task.blocker }));

  let status: DailyPlanningView['status'];
  if (!snapshot) {
    status = context.status === 'unavailable' ? 'unavailable' : snapshotRead.status === 'empty' ? 'empty' : 'degraded';
  } else if (
    context.status !== 'ready' ||
    snapshotRead.status !== 'ready' ||
    unresolvedPlanRefs > 0
  ) {
    status = 'degraded';
  } else {
    status = 'ready';
  }

  let notice = snapshotRead.notice;
  if (unresolvedPlanRefs > 0) {
    notice = `${notice ? `${notice} ` : ''}${unresolvedPlanRefs} referencia(s) del plan ya no pudieron resolverse contra las fuentes actuales.`;
  } else if (context.status === 'degraded' && !notice) {
    notice = 'Algunas fuentes actuales no pudieron verificarse; el plan se muestra con calidad degradada.';
  }

  return {
    status,
    notice,
    targetDate: context.targetDate,
    planGeneratedAt: snapshot?.generatedAt ?? null,
    contextSyncedAt: context.syncedAt,
    timezone: context.timezone,
    fixedCommitments,
    dateMarkers,
    must,
    should,
    could,
    notToday,
    suggestedBlocks,
    minimumViable,
    blockedTasks,
    pendingCount: context.tasks.length,
    sources: sourceViews(context, snapshotRead),
    quality: {
      unresolvedPlanRefs,
      ambiguousTaskDates: context.quality.tasksWithAmbiguousDate,
      missingTaskDurations: context.quality.tasksMissingDuration,
      missingTaskPriorities: context.quality.tasksMissingPriority,
      calendarDateConflicts: context.quality.calendarDateConflicts,
    },
  };
}
