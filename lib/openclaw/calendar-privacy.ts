/**
 * Política centralizada Calendar → OpenClaw.
 *
 * Los consumidores server-to-server de OpenClaw (`system.overview`, `areas.get`,
 * `calendar.upcoming`) nunca deben recibir eventos de Journaling. El Calendar real
 * contiene eventos recurrentes titulados «📓 Journaling»; proyectarlos en el DTO
 * hace que `lib/openclaw/read-boundary.ts` bloquee la respuesta completa por su
 * regla `/journaling/i` y OpenClaw devuelve HTTP 500.
 *
 * Esta política hace que el evento desaparezca por completo del contexto OpenClaw
 * antes de construir el DTO —sin placeholder ni redacción parcial— de modo que la
 * respuesta legítima (agenda con eventos normales) sí pueda superar la frontera.
 *
 * El read-boundary conserva intacta su regla `/journaling/i` como defensa final
 * fail-closed: si una regresión vuelve a proyectar Journaling, la frontera sigue
 * rechazando la respuesta.
 *
 * `/agenda` web NO usa este filtro: el usuario debe seguir viendo su Calendar real
 * completo. El filtro se aplica sólo en `getCalendarAgendaForTrustedService`.
 */
import type { CalendarEvent } from '@/types/calendar';

/** Misma expresión que la defensa final del read-boundary, case-insensitive. */
const OPENCLAW_PRIVATE_CALENDAR_PATTERN = /journaling/i;

type CalendarEventPrivacyFields = Pick<CalendarEvent, 'title' | 'calendarLabel' | 'location'>;

/**
 * `true` si el evento representa Journaling en cualquiera de sus campos de texto
 * proyectables (título, etiqueta de calendario o ubicación).
 */
export function isOpenClawExcludedCalendarEvent(event: CalendarEventPrivacyFields): boolean {
  return (
    OPENCLAW_PRIVATE_CALENDAR_PATTERN.test(event.title ?? '') ||
    OPENCLAW_PRIVATE_CALENDAR_PATTERN.test(event.calendarLabel ?? '') ||
    OPENCLAW_PRIVATE_CALENDAR_PATTERN.test(event.location ?? '')
  );
}

/** Excluye por completo los eventos de Journaling antes de cualquier DTO OpenClaw. */
export function filterCalendarEventsForOpenClaw<T extends CalendarEventPrivacyFields>(
  events: readonly T[],
): T[] {
  return events.filter((event) => !isOpenClawExcludedCalendarEvent(event));
}
