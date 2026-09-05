import { adaptCalendarEvent, type GoogleCalendarEventRaw } from '@/lib/calendar/adapters';
import type {
  DailyPlanningCalendarEvent,
  DailyPlanningCalendarProvenance,
  DailyPlanningCalendarRole,
} from '@/types/daily-planning-intelligence';

function roleFor(event: { allDay: boolean; blocksTime: boolean }): DailyPlanningCalendarRole {
  // Contrato Daily Planning: un all-day es marcador de fecha, no 24 h de capacidad ocupada.
  if (event.allDay) return 'date-marker';
  if (event.blocksTime) return 'capacity-block';
  return 'informational';
}

function provenanceFor(description: string | null | undefined): DailyPlanningCalendarProvenance {
  const text = description?.toLocaleLowerCase('es') ?? '';
  if (/confirmad[oa]\s+por\s+vos/.test(text)) return 'user-confirmed';
  if (/figura\s+en\s+uv|campus\s+virtual|autogesti[oó]n/.test(text)) return 'official-source';
  if (/cronograma/.test(text)) return 'schedule-derived';
  if (/confianza\s*:\s*(?:muy\s+)?probable|\bprobable\b/.test(text)) return 'probable';
  return 'unknown';
}

function normalizeExplicitDate(
  description: string | null | undefined,
  eventDate: string,
): string | null {
  if (!description) return null;
  const match = description.match(
    /fecha(?:\s+confirmada\s+por\s+vos)?\s*:\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = match[3];
  const eventYear = Number(eventDate.slice(0, 4));
  const year = rawYear
    ? rawYear.length === 2
      ? 2000 + Number(rawYear)
      : Number(rawYear)
    : eventYear;

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Valida combinaciones imposibles (31/02, etc.) sin depender del timezone local.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Adapta un raw de Calendar a evidencia factual para planificación.
 * La descripción cruda se usa solo para provenance/conflictos y no cruza el DTO final.
 */
export function adaptDailyPlanningCalendarEvent(
  raw: GoogleCalendarEventRaw,
  calendarId: string,
  timeZone: string,
  publicCalendarLabel: string,
): DailyPlanningCalendarEvent | null {
  const event = adaptCalendarEvent(raw, calendarId, timeZone, publicCalendarLabel);
  if (!event || event.status === 'cancelled') return null;

  const describedDate = normalizeExplicitDate(raw.description, event.startDate);
  return {
    ...event,
    planningRole: roleFor(event),
    evidence: {
      provenance: provenanceFor(raw.description),
      describedDate,
      dateConflict: describedDate !== null && describedDate !== event.startDate,
    },
  };
}
