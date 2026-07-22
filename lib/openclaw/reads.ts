/**
 * Lecturas autorizadas para OpenClaw (sin sesión cookie; reutiliza loaders/datos).
 */
import 'server-only';

import { composeAreaDashboard, composeAreasIndex } from '@/lib/areas/compose';
import { getCanonicalAreaDef, isAreaSlug } from '@/lib/areas/canonical';
import { opaqueKey } from '@/lib/actions/opaque';
import { listRuntimeProposals } from '@/lib/actions/runtime';
import { isWriteActionsEnabled } from '@/lib/actions/config';
import { getCalendarAgenda } from '@/lib/data/calendar-source';
import { getDataSource } from '@/lib/data/config';
import { loadGymDashboardData } from '@/lib/gym/load';
import { loadNotionDashboard } from '@/lib/notion/dashboard';
import {
  clampOpenClawLimit,
  decodeOpenClawCursor,
  encodeOpenClawCursor,
  isCanonicalAreaSlugInput,
  validateCalendarUpcomingDays,
} from '@/lib/openclaw/read-input';
import { resolveWebCatalogPage, searchWebCatalog } from '@/lib/web-catalog/service';
import { getNotionDataSource } from '@/lib/notion/config';
import { getCalendarDataSource } from '@/lib/calendar/config';
import type { OpenClawDataFreshness, OpenClawReadOperation } from '@/types/openclaw';
import type { AreaSlug } from '@/types/areas';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function freshnessFromSources(sources: readonly string[]): OpenClawDataFreshness {
  if (sources.includes('mock')) return 'mock';
  if (sources.includes('partial') || sources.includes('error')) return 'partial';
  if (sources.includes('unavailable')) return 'unavailable';
  return 'live';
}

function sanitizeTask(task: {
  id: string;
  title: string;
  status: string;
  date: string | null;
  priority: string | null;
  domain: string;
  note: string | null;
  area: { id: string; name: string | null } | null;
  project: { id: string; name: string | null } | null;
}) {
  return {
    key: opaqueKey('task', task.id),
    title: task.title,
    status: task.status,
    date: task.date,
    priority: task.priority,
    domain: task.domain,
    notePreview: task.note ? task.note.slice(0, 120) : null,
    areaKey: task.area ? opaqueKey('area', task.area.id) : null,
    areaName: task.area?.name ?? null,
    projectKey: task.project ? opaqueKey('proj', task.project.id) : null,
    projectName: task.project?.name ?? null,
  };
}

function sanitizeProject(project: {
  id: string;
  name: string;
  status: string;
  domain: string;
  nextAction: string | null;
  dueDate: string | null;
  area: { id: string; name: string | null } | null;
}) {
  return {
    key: opaqueKey('proj', project.id),
    name: project.name,
    status: project.status,
    domain: project.domain,
    nextAction: project.nextAction,
    dueDate: project.dueDate,
    areaKey: project.area ? opaqueKey('area', project.area.id) : null,
    areaName: project.area?.name ?? null,
  };
}

export type OpenClawReadResult =
  | {
      ok: true;
      data: unknown;
      dataFreshness: OpenClawDataFreshness;
      sources: readonly string[];
      warnings: readonly string[];
      nextCursor: string | null;
      itemCount: number;
    }
  | { ok: false; code: string; message: string; retryable?: boolean };

export async function executeOpenClawRead(
  operation: OpenClawReadOperation,
  input: unknown,
): Promise<OpenClawReadResult> {
  const body = asRecord(input) ?? {};

  if (operation === 'system.overview') {
    const [notion, agenda, proposals, gym] = await Promise.all([
      loadNotionDashboard(),
      getCalendarAgenda('7'),
      listRuntimeProposals(),
      loadGymDashboardData(),
    ]);
    const pending = proposals.filter((row) => row.status === 'pending');
    const sources = [
      notion.source === 'mock' ? 'mock' : 'notion',
      agenda.source === 'mock' ? 'mock' : 'calendar',
      getDataSource() === 'mock' ? 'mock' : 'sheets',
      getNotionDataSource(),
      getCalendarDataSource(),
    ];
    const upcomingTasks = notion.tasks
      .filter((task) => task.status !== 'Hecha')
      .slice(0, 10)
      .map(sanitizeTask);
    return {
      ok: true,
      dataFreshness: freshnessFromSources(sources),
      sources,
      warnings: [notion.notice, agenda.notice, gym.moduleNotice].filter((value): value is string =>
        Boolean(value),
      ),
      nextCursor: null,
      itemCount: upcomingTasks.length,
      data: {
        sources: {
          notion: notion.status,
          sheets: getDataSource(),
          calendar: agenda.status,
          writesEnabled: isWriteActionsEnabled(),
        },
        areasCount: notion.areas.length,
        activeProjects: notion.projects.filter((project) => project.status === 'Activo').length,
        upcomingTasks,
        upcomingEvents: agenda.days
          .flatMap((day) => day.events)
          .slice(0, 10)
          .map((event) => ({
            key: opaqueKey('cal', event.id),
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
            startTime: event.startTime,
            endTime: event.endTime,
            allDay: event.allDay,
          })),
        gym: {
          moduleStatus: gym.moduleStatus,
          hasRoutine: Boolean(gym.routine),
          sessionsStructured: false,
        },
        pendingProposals: pending.length,
      },
    };
  }

  if (operation === 'areas.list') {
    const notion = await loadNotionDashboard();
    const { summaries, sources } = composeAreasIndex(notion, [
      {
        kind: 'notion',
        state: notion.status === 'ready' ? 'ready' : notion.status === 'mock' ? 'mock' : 'error',
        notice: notion.notice,
      },
    ]);
    return {
      ok: true,
      data: { areas: summaries },
      dataFreshness: notion.source === 'mock' ? 'mock' : 'live',
      sources: sources.map((source) => source.state),
      warnings: notion.notice ? [notion.notice] : [],
      nextCursor: null,
      itemCount: summaries.length,
    };
  }

  if (operation === 'areas.get') {
    const slugRaw =
      typeof body.slug === 'string'
        ? body.slug
        : typeof body.areaKey === 'string'
          ? body.areaKey.replace(/^area\./, '')
          : '';
    if (
      !isCanonicalAreaSlugInput(slugRaw) ||
      !isAreaSlug(slugRaw) ||
      !getCanonicalAreaDef(slugRaw)
    ) {
      return { ok: false, code: 'invalid-input', message: 'Área no canónica.' };
    }
    const slug = slugRaw as AreaSlug;
    const [notion, agenda] = await Promise.all([loadNotionDashboard(), getCalendarAgenda('7')]);
    const data = composeAreaDashboard({
      slug,
      notion,
      calendarEvents: agenda.days.flatMap((day) => day.events),
      sheets: null,
      sources: [
        {
          kind: 'notion',
          state: notion.status === 'ready' ? 'ready' : 'mock',
          notice: notion.notice,
        },
      ],
      northHint: null,
      allowMockMetrics: false,
    });
    if (!data) {
      return { ok: false, code: 'not-found', message: 'Área no disponible.' };
    }
    return {
      ok: true,
      data: {
        key: data.summary.stableKey,
        slug: data.summary.slug,
        name: data.summary.name,
        metrics: data.metrics,
        projects: data.activeProjects,
        upcomingTasks: data.upcomingTasks,
        integrityWarnings: data.integrity,
      },
      dataFreshness: notion.source === 'mock' ? 'mock' : 'live',
      sources: ['notion', 'calendar'],
      warnings: data.integrity.map((warning) => warning.message),
      nextCursor: null,
      itemCount: 1,
    };
  }

  if (operation === 'tasks.list') {
    const notion = await loadNotionDashboard();
    let tasks = [...notion.tasks];
    if (typeof body.status === 'string' && body.status.trim()) {
      tasks = tasks.filter((task) => task.status === body.status);
    }
    if (typeof body.areaKey === 'string' && body.areaKey.trim()) {
      tasks = tasks.filter((task) => task.area && opaqueKey('area', task.area.id) === body.areaKey);
    }
    if (typeof body.projectKey === 'string' && body.projectKey.trim()) {
      tasks = tasks.filter(
        (task) => task.project && opaqueKey('proj', task.project.id) === body.projectKey,
      );
    }
    if (typeof body.dueBefore === 'string' && body.dueBefore.trim()) {
      const dueBefore = body.dueBefore;
      tasks = tasks.filter((task) => task.date && task.date <= dueBefore);
    }
    const limit = clampOpenClawLimit(body.limit);
    const offset = decodeOpenClawCursor(body.cursor);
    const slice = tasks.slice(offset, offset + limit).map(sanitizeTask);
    const nextOffset = offset + slice.length;
    return {
      ok: true,
      data: { tasks: slice },
      dataFreshness: notion.source === 'mock' ? 'mock' : 'live',
      sources: ['notion'],
      warnings: [],
      nextCursor: nextOffset < tasks.length ? encodeOpenClawCursor(nextOffset) : null,
      itemCount: slice.length,
    };
  }

  if (operation === 'projects.list') {
    const notion = await loadNotionDashboard();
    let projects = [...notion.projects];
    if (typeof body.status === 'string' && body.status.trim()) {
      projects = projects.filter((project) => project.status === body.status);
    }
    if (typeof body.areaKey === 'string' && body.areaKey.trim()) {
      projects = projects.filter(
        (project) => project.area && opaqueKey('area', project.area.id) === body.areaKey,
      );
    }
    const limit = clampOpenClawLimit(body.limit);
    const offset = decodeOpenClawCursor(body.cursor);
    const slice = projects.slice(offset, offset + limit).map(sanitizeProject);
    const nextOffset = offset + slice.length;
    return {
      ok: true,
      data: { projects: slice },
      dataFreshness: notion.source === 'mock' ? 'mock' : 'live',
      sources: ['notion'],
      warnings: [],
      nextCursor: nextOffset < projects.length ? encodeOpenClawCursor(nextOffset) : null,
      itemCount: slice.length,
    };
  }

  if (operation === 'calendar.upcoming') {
    const validated = validateCalendarUpcomingDays(body.days);
    if (!validated.ok) {
      return {
        ok: false,
        code: 'invalid-input',
        message: validated.message,
      };
    }
    const days = validated.days;
    const view = days <= 1 ? 'today' : days <= 7 ? '7' : '30';
    const agenda = await getCalendarAgenda(view);
    const events = agenda.days.flatMap((day) =>
      day.events.map((event) => ({
        key: opaqueKey('cal', event.id),
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startTime,
        endTime: event.endTime,
        allDay: event.allDay,
        calendarLabel: event.calendarLabel ?? null,
      })),
    );
    return {
      ok: true,
      data: { days: agenda.days.map((day) => day.date), events },
      dataFreshness: agenda.source === 'mock' ? 'mock' : 'live',
      sources: ['calendar'],
      warnings: agenda.notice ? [agenda.notice] : [],
      nextCursor: null,
      itemCount: events.length,
    };
  }

  if (operation === 'gym.summary') {
    const gym = await loadGymDashboardData();
    return {
      ok: true,
      data: {
        moduleStatus: gym.moduleStatus,
        moduleNotice: gym.moduleNotice,
        routineAvailable: Boolean(gym.routine),
        routineTitle: gym.routine?.name ?? null,
        metricsAvailable: gym.progress.length > 0,
        sourceStates: gym.sources.map((source) => ({
          kind: source.kind,
          state: source.state,
        })),
        sessionsStructured: false,
        sessionsNotice: gym.sessionsPendingNotice,
      },
      dataFreshness:
        gym.moduleStatus === 'ready'
          ? 'live'
          : gym.moduleStatus === 'flag-disabled'
            ? 'unavailable'
            : 'partial',
      sources: gym.sources.map((source) => source.kind),
      warnings: gym.warnings.map((warning) => warning.message),
      nextCursor: null,
      itemCount: 1,
    };
  }

  if (operation === 'approvals.list') {
    const statusFilter =
      typeof body.status === 'string' && body.status.trim() ? body.status.trim() : undefined;
    const proposals = await listRuntimeProposals();
    const filtered = statusFilter
      ? proposals.filter((row) => row.status === statusFilter)
      : proposals;
    const limit = clampOpenClawLimit(body.limit, 50);
    const slice = filtered.slice(0, limit).map((row) => ({
      key: row.key,
      name: row.name,
      actionType: row.actionType,
      status: row.status,
      risk: row.risk,
      reversible: row.reversible,
      reason: row.reason,
      expectedChange: row.expectedChange,
      createdAt: row.createdAt,
    }));
    return {
      ok: true,
      data: { proposals: slice },
      dataFreshness: 'live',
      sources: ['proposals'],
      warnings: [],
      nextCursor: null,
      itemCount: slice.length,
    };
  }

  if (operation === 'documents.search') {
    const query = typeof body.query === 'string' ? body.query : '';
    if (query.length > 200) {
      return { ok: false, code: 'invalid-input', message: 'Query documental demasiado larga.' };
    }
    const result = await searchWebCatalog(query);
    if (!result.ok) {
      return {
        ok: false,
        code: result.code === 'flag-disabled' ? 'flag-disabled' : 'source-unavailable',
        message: result.message,
      };
    }
    const hits = result.hits.map((hit) => ({
      title: hit.title,
      section: hit.section,
      sectionLabel: hit.sectionLabel,
      snippet: hit.snippet,
      href: hit.href,
    }));
    return {
      ok: true,
      data: { hits },
      dataFreshness: 'live',
      sources: ['web-catalog'],
      warnings: [],
      nextCursor: null,
      itemCount: hits.length,
    };
  }

  if (operation === 'document.get') {
    const slug = typeof body.slug === 'string' ? body.slug : '';
    if (!slug.trim()) {
      return { ok: false, code: 'invalid-input', message: 'slug requerido.' };
    }
    const result = await resolveWebCatalogPage(slug);
    if (!result.ok) {
      return {
        ok: false,
        code:
          result.code === 'forbidden-policy'
            ? 'forbidden'
            : result.code === 'flag-disabled'
              ? 'flag-disabled'
              : result.code === 'not-found'
                ? 'not-found'
                : 'source-unavailable',
        message: result.message,
      };
    }
    if (result.kind === 'redirect') {
      return {
        ok: true,
        data: { kind: 'redirect', slug: result.slug, href: `/p/${result.slug}` },
        dataFreshness: 'live',
        sources: ['web-catalog'],
        warnings: [],
        nextCursor: null,
        itemCount: 1,
      };
    }
    if (result.kind === 'unimplemented-renderer') {
      return {
        ok: true,
        data: {
          kind: 'unimplemented-renderer',
          slug: result.entry.slug,
          title: result.entry.editorialName,
          href: `/p/${result.entry.slug}`,
          message: result.message,
        },
        dataFreshness: 'live',
        sources: ['web-catalog'],
        warnings: [result.message],
        nextCursor: null,
        itemCount: 1,
      };
    }
    return {
      ok: true,
      data: {
        kind: 'document',
        slug: result.page.slug,
        title: result.page.title,
        href: `/p/${result.page.slug}`,
        summary: null,
        blocksPreview: result.page.blocks.slice(0, 20).map((block) => ({
          type: block.type,
          text: block.text
            .map((part) => part.plain)
            .join('')
            .slice(0, 500),
        })),
      },
      dataFreshness: 'live',
      sources: ['web-catalog'],
      warnings: [],
      nextCursor: null,
      itemCount: 1,
    };
  }

  return { ok: false, code: 'invalid-operation', message: 'Operación no registrada.' };
}
