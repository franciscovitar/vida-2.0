/**
 * Utilidades de tiempo civil en America/Argentina/Cordoba.
 * Evita mostrar medianoche artificial para eventos sin hora.
 */
import { CALENDAR_TIMEZONE } from '@/lib/calendar/constants';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Fecha civil YYYY-MM-DD en la zona Calendar. */
export function todayInCalendarTz(now: Date = new Date(), timeZone = CALENDAR_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Minutos desde medianoche local (0–1439). */
export function minutesInCalendarTz(now: Date = new Date(), timeZone = CALENDAR_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const h = Number.isFinite(hour) ? hour % 24 : 0;
  const m = Number.isFinite(minute) ? minute : 0;
  return h * 60 + m;
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const hours = Math.floor(clamped / 60) % 24;
  const minutes = clamped % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

export function parseTimeToMinutes(hhmm: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return 0;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

/** Partes civiles de un instante ISO en la zona Calendar (sin forzar medianoche). */
export function zonedDateTimeParts(
  iso: string,
  timeZone = CALENDAR_TIMEZONE,
): { date: string; time: string; minutes: number } {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  let hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  // en-GB/en-CA a veces devuelven "24" para medianoche.
  if (hour === '24') hour = '00';

  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  return {
    date: `${year}-${month}-${day}`,
    time,
    minutes: parseTimeToMinutes(time),
  };
}

/**
 * Instantes RFC3339 de inicio/fin de un día civil en Cordoba para events.list.
 * Usa mediodía UTC del día como ancla y formatea en zona Calendar… mejor:
 * construye offset fijo -03:00 (Cordoba sin DST).
 */
export function civilDayBoundsRfc3339(
  ymd: string,
  timeZone = CALENDAR_TIMEZONE,
): { timeMin: string; timeMax: string } {
  void timeZone;
  // America/Argentina/Cordoba observa UTC-3 todo el año (sin DST).
  return {
    timeMin: `${ymd}T00:00:00-03:00`,
    timeMax: `${ymd}T23:59:59-03:00`,
  };
}

export function rangeBoundsRfc3339(
  startYmd: string,
  endYmdInclusive: string,
): { timeMin: string; timeMax: string } {
  return {
    timeMin: `${startYmd}T00:00:00-03:00`,
    // fin exclusivo del día siguiente para cubrir el último día completo.
    timeMax: `${endYmdInclusive}T23:59:59-03:00`,
  };
}

/** Resta un día civil a un YYYY-MM-DD de fin exclusivo de Google (all-day). */
export function exclusiveEndToInclusive(
  endDateExclusive: string,
  addDaysYmd: (d: string, n: number) => string,
): string {
  return addDaysYmd(endDateExclusive, -1);
}
