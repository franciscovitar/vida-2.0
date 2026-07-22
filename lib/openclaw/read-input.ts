/**
 * Validación pura de inputs de lectura OpenClaw (testeable sin server-only).
 */
import { OPENCLAW_MAX_CALENDAR_DAYS, OPENCLAW_MAX_LIST_LIMIT } from '@/lib/openclaw/config';
import type { OpenClawReadOperation } from '@/types/openclaw';

export const OPENCLAW_READ_OPERATIONS: readonly OpenClawReadOperation[] = [
  'system.overview',
  'areas.list',
  'areas.get',
  'tasks.list',
  'projects.list',
  'calendar.upcoming',
  'gym.summary',
  'approvals.list',
  'documents.search',
  'document.get',
] as const;

export function isOpenClawReadOperation(value: string): value is OpenClawReadOperation {
  return (OPENCLAW_READ_OPERATIONS as readonly string[]).includes(value);
}

export function clampOpenClawLimit(raw: unknown, fallback = 20): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), OPENCLAW_MAX_LIST_LIMIT);
}

export function validateCalendarUpcomingDays(
  raw: unknown,
): { ok: true; days: number } | { ok: false; message: string } {
  const daysRaw = typeof raw === 'number' ? raw : Number(raw ?? 7);
  const days = Number.isFinite(daysRaw) ? Math.floor(daysRaw) : 7;
  if (days < 1 || days > OPENCLAW_MAX_CALENDAR_DAYS) {
    return {
      ok: false,
      message: `Rango Calendar máximo ${OPENCLAW_MAX_CALENDAR_DAYS} días.`,
    };
  }
  return { ok: true, days };
}

export function encodeOpenClawCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

export function decodeOpenClawCursor(cursor: unknown): number {
  if (typeof cursor !== 'string' || !cursor.trim()) return 0;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const n = Number(decoded);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function isCanonicalAreaSlugInput(slug: string): boolean {
  return (
    slug === 'facultad' || slug === 'genova-trabajo' || slug === 'salud' || slug === 'vida-personal'
  );
}
