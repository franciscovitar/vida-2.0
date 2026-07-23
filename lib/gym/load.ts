/**
 * Carga server-only del dashboard de Gimnasio (fallos parciales aislados).
 */
import 'server-only';

import { cache } from 'react';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { getCalendarAgenda } from '@/lib/data/calendar-source';
import { getDomainPages } from '@/lib/data/domain-pages';
import { composeGymDashboard } from '@/lib/gym/compose';
import { resolveCanonicalGymEntry } from '@/lib/gym/resolve';
import { GYM_SESSIONS_PENDING_NOTICE } from '@/lib/gym/sessions-port';
import { loadGymSessionsSnapshot } from '@/lib/gym/sheets-sessions-port';
import { getWebCatalogNotionConfig, isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { readWebCatalogContentPage } from '@/lib/web-catalog/content-reader';
import { createWebCatalogNotionPort } from '@/lib/web-catalog/notion-port';
import { loadValidatedWebCatalog } from '@/lib/web-catalog/notion-repository';
import { RD } from '@/lib/google/constants';
import type { ContentPage } from '@/types/content';
import type { GymDashboardData, GymDataSourceStatus, GymParseWarning } from '@/types/gym';
import type { GymActivityDay } from '@/lib/gym/analytics';

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

function emptyDashboard(
  partial: Pick<GymDashboardData, 'moduleStatus' | 'moduleNotice' | 'sources' | 'warnings'> & {
    targetDate?: string;
  },
): GymDashboardData {
  return composeGymDashboard({
    targetDate: partial.targetDate ?? todayInBuenosAires(),
    moduleStatus: partial.moduleStatus,
    moduleNotice: partial.moduleNotice,
    contentPage: null,
    activityDays: [],
    weeklyTarget: null,
    readiness: {
      energy: null,
      sleep: null,
      recentExercise: null,
      commitments: [],
      coverage: null,
    },
    sessionSummaries: [],
    sources: partial.sources,
    extraWarnings: partial.warnings,
  });
}

export async function loadGymDashboardData(): Promise<GymDashboardData> {
  const today = todayInBuenosAires();
  const warnings: GymParseWarning[] = [];
  const sources: GymDataSourceStatus[] = [];

  if (!isWebCatalogEnabled()) {
    sources.push({ kind: 'sessions', state: 'not-applicable', notice: null });
    sources.push({
      kind: 'notion',
      state: 'disabled',
      notice: 'Registro Web desactivado (WEB_CATALOG_ENABLED).',
    });
    sources.push({ kind: 'sheets', state: 'not-applicable', notice: null });
    sources.push({ kind: 'calendar', state: 'not-applicable', notice: null });
    return emptyDashboard({
      moduleStatus: 'flag-disabled',
      moduleNotice:
        'Gimnasio aún no está habilitado. Activá el Registro Web cuando la rutina esté publicada.',
      sources,
      warnings,
      targetDate: today,
    });
  }

  const config = getWebCatalogNotionConfig();
  if (!config.ok) {
    sources.push({ kind: 'sessions', state: 'not-applicable', notice: null });
    sources.push({
      kind: 'notion',
      state: 'unavailable',
      notice: 'Catálogo Notion no configurado.',
    });
    sources.push({ kind: 'sheets', state: 'not-applicable', notice: null });
    sources.push({ kind: 'calendar', state: 'not-applicable', notice: null });
    return emptyDashboard({
      moduleStatus: 'not-configured',
      moduleNotice: 'Falta configuración del Registro Web para leer la rutina.',
      sources,
      warnings,
      targetDate: today,
    });
  }

  let contentPage: ContentPage | null = null;
  let moduleStatus: GymDashboardData['moduleStatus'] = 'ready';
  let moduleNotice: string | null = null;

  try {
    const catalog = await loadValidatedWebCatalog();
    if (!catalog.ok) {
      sources.push({
        kind: 'notion',
        state: 'error',
        notice: 'No se pudo cargar el Registro Web.',
      });
      warnings.push({
        code: 'source-down',
        message: 'Notion/catálogo no disponible para la rutina.',
        subject: 'notion',
      });
      moduleStatus = 'error';
      moduleNotice = 'No se pudo cargar el catálogo de rutinas.';
    } else {
      const resolved = resolveCanonicalGymEntry(catalog.entries);
      if (!resolved.ok) {
        sources.push({
          kind: 'notion',
          state: resolved.code === 'none' ? 'empty' : 'error',
          notice: resolved.message,
        });
        if (resolved.code === 'ambiguous') {
          warnings.push({
            code: 'ambiguous-gym-entries',
            message: resolved.message,
            subject: null,
          });
          moduleStatus = 'ambiguous';
        } else if (resolved.code === 'hidden' || resolved.code === 'unauthorized') {
          moduleStatus = 'forbidden';
        } else {
          moduleStatus = 'empty';
        }
        moduleNotice = resolved.message;
      } else {
        const port = createWebCatalogNotionPort(config.token);
        const content = await readWebCatalogContentPage(
          port,
          resolved.entry,
          catalog.index,
          catalog.entries,
        );
        if (!content.ok) {
          sources.push({
            kind: 'notion',
            state: 'error',
            notice: 'No se pudo leer la página de la rutina.',
          });
          warnings.push({
            code: 'source-down',
            message: 'Fallo al leer el contenido de la rutina en Notion.',
            subject: 'notion',
          });
          moduleStatus = 'partial';
          moduleNotice =
            'La rutina no pudo leerse; se muestra el contexto cuantitativo disponible.';
        } else {
          contentPage = content.page;
          sources.push({ kind: 'notion', state: 'ready', notice: null });
          moduleStatus = 'ready';
          moduleNotice = null;
        }
      }
    }
  } catch {
    sources.push({
      kind: 'notion',
      state: 'error',
      notice: 'Error inesperado al leer Notion.',
    });
    warnings.push({
      code: 'source-down',
      message: 'Notion caído; se mantiene el resto del panel.',
      subject: 'notion',
    });
    moduleStatus = 'partial';
    moduleNotice = 'Notion no disponible para la rutina.';
  }

  // Sheets + Calendar en paralelo; fallos aislados.
  let activityDays: GymActivityDay[] = [];
  let weeklyTarget: number | null = 3;
  let energy: string | null = null;
  let sleep: string | null = null;
  let recentExercise: string | null = null;
  let coverage: string | null = null;
  let commitments: string[] = [];

  const [pagesResult, agendaResult, sessionsResult] = await Promise.allSettled([
    getDomainPages(7),
    getCalendarAgenda('7'),
    loadGymSessionsSnapshot(),
  ]);

  let sessionSummaries: GymDashboardData['sessionSummaries'] = [];
  let exerciseProgress: GymDashboardData['exerciseProgress'] = [];
  let sessionsNotice = GYM_SESSIONS_PENDING_NOTICE;

  if (sessionsResult.status === 'fulfilled') {
    const snapshot = sessionsResult.value;
    sessionSummaries = snapshot.summaries;
    exerciseProgress = snapshot.exerciseProgress;
    sessionsNotice =
      snapshot.state === 'ready'
        ? 'Historial leído desde Gym Sessions y Gym Sets.'
        : (snapshot.notice ?? GYM_SESSIONS_PENDING_NOTICE);
    sources.push({ kind: 'sessions', state: snapshot.state, notice: snapshot.notice });
  } else {
    sources.push({
      kind: 'sessions',
      state: 'error',
      notice: 'No se pudo leer el historial estructurado.',
    });
    warnings.push({
      code: 'source-down',
      message: 'El historial de sesiones no está disponible.',
      subject: 'sessions',
    });
  }

  if (pagesResult.status === 'fulfilled') {
    const pages = pagesResult.value;
    const meta = pages.habits;
    const allowMetrics =
      !(isProductionRuntime() && meta.source === 'mock') &&
      (meta.status === 'ready' || (meta.status === 'mock' && !isProductionRuntime()));

    if (!allowMetrics) {
      sources.push({
        kind: 'sheets',
        state: isProductionRuntime() ? 'not-applicable' : meta.status === 'mock' ? 'mock' : 'error',
        notice: meta.notice,
      });
      weeklyTarget = null;
    } else {
      sources.push({
        kind: 'sheets',
        state: meta.source === 'mock' ? 'mock' : 'ready',
        notice: meta.notice,
      });

      const gymGoal = pages.habits.weeklyGoals.find((goal) => goal.id === 'goal-gym');
      weeklyTarget = gymGoal?.target ?? 3;

      const gymHeader = RD.gym;
      activityDays = pages.habits.calendar.map((day) => {
        const cell = day.cells[gymHeader];
        let trained: boolean | null = null;
        if (cell === 'done') trained = true;
        else if (cell === 'missed') trained = false;
        else trained = null;
        return { date: day.date, trained, durationMinutes: null };
      });

      const sleepMetric = pages.health.metrics.find((item) => /sue[nñ]o|sleep/i.test(item.label));
      const hr = pages.health.metrics.find((item) => /cardi|hr|fc|energ/i.test(item.label));
      const steps = pages.health.metrics.find((item) => /pasos|steps/i.test(item.label));
      sleep = sleepMetric?.averageLabel ?? null;
      energy = hr?.averageLabel ?? null;
      recentExercise =
        gymGoal && gymGoal.currentWeek > 0
          ? `${gymGoal.currentWeek} sesión(es) esta semana`
          : steps?.averageLabel
            ? `Pasos: ${steps.averageLabel}`
            : null;
      coverage =
        pages.habits.availableDays > 0
          ? `Hábitos: ${pages.habits.availableDays} días con dato`
          : (pages.habits.notice ?? pages.health.notice ?? null);
    }
  } else {
    sources.push({
      kind: 'sheets',
      state: 'error',
      notice: 'Sheets no disponible.',
    });
    warnings.push({
      code: 'source-down',
      message: 'Sheets caído; rutina sin métricas inventadas.',
      subject: 'sheets',
    });
    if (moduleStatus === 'ready') {
      moduleStatus = 'partial';
      moduleNotice = moduleNotice ?? 'Métricas de Sheets no disponibles.';
    }
    weeklyTarget = null;
  }

  if (agendaResult.status === 'fulfilled') {
    const agenda = agendaResult.value;
    if (isProductionRuntime() && agenda.source === 'mock') {
      sources.push({
        kind: 'calendar',
        state: 'unavailable',
        notice: agenda.notice,
      });
    } else if (agenda.status === 'ready' || agenda.status === 'mock' || agenda.status === 'empty') {
      sources.push({
        kind: 'calendar',
        state: agenda.status === 'mock' ? 'mock' : agenda.status === 'empty' ? 'empty' : 'ready',
        notice: agenda.notice,
      });
      const events = agenda.days.flatMap((day) => day.events);
      commitments = events
        .filter((event) => /gym|gimnasio|entreno|entrenamiento|salud/i.test(event.title))
        .slice(0, 5)
        .map((event) => event.title);
    } else {
      sources.push({
        kind: 'calendar',
        state: 'error',
        notice: agenda.notice,
      });
      warnings.push({
        code: 'source-down',
        message: 'Calendar no disponible; se omite el contexto temporal.',
        subject: 'calendar',
      });
    }
  } else {
    sources.push({
      kind: 'calendar',
      state: 'error',
      notice: 'Calendar no disponible.',
    });
    warnings.push({
      code: 'source-down',
      message: 'Calendar caído; se omite el contexto temporal.',
      subject: 'calendar',
    });
  }

  if (sessionSummaries.length > 0) {
    const byDate = new Map(activityDays.map((day) => [day.date, day]));
    for (const session of sessionSummaries) {
      if (session.completed !== true) continue;
      const existing = byDate.get(session.date);
      byDate.set(session.date, {
        date: session.date,
        trained: true,
        durationMinutes: session.durationMinutes ?? existing?.durationMinutes ?? null,
      });
    }
    activityDays = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sessionSummaries.find((session) => session.completed === true);
    if (latest) {
      recentExercise = `${latest.label ?? 'Sesión'} · ${latest.date}`;
    }
  }

  return composeGymDashboard({
    targetDate: today,
    moduleStatus,
    moduleNotice,
    contentPage,
    activityDays,
    weeklyTarget,
    readiness: {
      energy,
      sleep,
      recentExercise,
      commitments,
      coverage,
    },
    sessionSummaries,
    exerciseProgress,
    sessionsNotice,
    sources,
    extraWarnings: warnings,
  });
}

export const loadGymDashboard = cache(async (): Promise<GymDashboardData> => {
  await requireAuthorizedSession();
  return loadGymDashboardData();
});
