/**
 * Composición pura del dashboard de Gimnasio.
 */
import { computeGymAnalytics, type GymActivityDay } from '@/lib/gym/analytics';
import { parseGymRoutineFromContentPage } from '@/lib/gym/parse-routine';
import { GYM_SESSIONS_PENDING_NOTICE } from '@/lib/gym/sessions-port';
import { sanitizeGymNote } from '@/lib/gym/privacy';
import type { ContentPage } from '@/types/content';
import type {
  GymDashboardData,
  GymDataSourceStatus,
  GymModuleStatus,
  GymParseWarning,
  GymReadinessContext,
  GymSessionSummary,
} from '@/types/gym';

export type ComposeGymInput = {
  targetDate: string;
  moduleStatus: GymModuleStatus;
  moduleNotice: string | null;
  contentPage: ContentPage | null;
  activityDays: readonly GymActivityDay[];
  weeklyTarget: number | null;
  readiness: Omit<GymReadinessContext, 'disclaimer'>;
  sessionSummaries: readonly GymSessionSummary[];
  sources: readonly GymDataSourceStatus[];
  extraWarnings?: readonly GymParseWarning[];
  /** Edad máxima de la rutina en días antes de avisar "desactualizada". */
  staleAfterDays?: number;
};

const DISCLAIMER =
  'Contexto informativo. No indica si debés entrenar ni constituye consejo médico.';

function isStale(lastUpdatedAt: string | null, today: string, staleAfterDays: number): boolean {
  if (!lastUpdatedAt) return false;
  const day = lastUpdatedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = day.split('-').map(Number);
  const t1 = Date.UTC(y1!, m1! - 1, d1!);
  const t2 = Date.UTC(y2!, m2! - 1, d2!);
  const diff = Math.floor((t1 - t2) / 86_400_000);
  return diff > staleAfterDays;
}

export function composeGymDashboard(input: ComposeGymInput): GymDashboardData {
  const warnings: GymParseWarning[] = [...(input.extraWarnings ?? [])];
  let routine = null;
  let documentaryPage: ContentPage | null = null;

  if (input.contentPage) {
    const parsed = parseGymRoutineFromContentPage(input.contentPage);
    routine = parsed.routine;
    warnings.push(...parsed.warnings);
    if (parsed.documentaryFallback || parsed.routine.presentation === 'documentary') {
      documentaryPage = input.contentPage;
    }

    if (isStale(parsed.routine.lastUpdatedAt, input.targetDate, input.staleAfterDays ?? 90)) {
      warnings.push({
        code: 'stale-routine',
        message: 'La rutina no se actualiza desde hace tiempo.',
        subject: parsed.routine.name,
      });
    }
  }

  const analytics = computeGymAnalytics({
    days: input.activityDays,
    weeklyTarget: input.weeklyTarget,
    today: input.targetDate,
  });

  if (input.activityDays.some((day) => day.trained === null)) {
    warnings.push({
      code: 'incomplete-data',
      message: 'Hay días sin dato de entrenamiento; no se interpretan como cero.',
      subject: null,
    });
  }

  const readiness: GymReadinessContext = {
    energy: sanitizeGymNote(input.readiness.energy),
    sleep: sanitizeGymNote(input.readiness.sleep),
    recentExercise: sanitizeGymNote(input.readiness.recentExercise),
    commitments: input.readiness.commitments
      .map((item) => sanitizeGymNote(item))
      .filter((item): item is string => Boolean(item)),
    coverage: sanitizeGymNote(input.readiness.coverage),
    disclaimer: DISCLAIMER,
  };

  return {
    moduleStatus: input.moduleStatus,
    moduleNotice: input.moduleNotice,
    routine,
    documentaryPage,
    readiness,
    progress: analytics.metrics,
    sessionSummaries: input.sessionSummaries,
    sources: input.sources,
    warnings,
    sessionsPendingNotice: GYM_SESSIONS_PENDING_NOTICE,
    targetDate: input.targetDate,
    areaHref: '/areas/salud',
  };
}
