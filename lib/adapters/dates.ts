/**
 * Fechas estables en la zona horaria de Argentina.
 *
 * Las fechas se manejan como cadenas `YYYY-MM-DD` (solo día, sin hora) para
 * evitar cualquier desplazamiento por UTC. La conversión de números de serie de
 * Sheets usa aritmética entera pura (algoritmo de Howard Hinnant), sin objetos
 * `Date`, por lo que tampoco hay corrimientos por zona horaria.
 */

const AR_TZ = 'America/Argentina/Buenos_Aires';

/** Días entre 1899-12-30 (época de Sheets) y 1970-01-01 (época Unix). */
const SHEETS_EPOCH_OFFSET = 25569;

/** Convierte días desde 1970-01-01 a fecha civil (algoritmo de Hinnant). */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const year = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? year + 1 : year, month, day };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toYMD(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Fecha de hoy en Argentina, como `YYYY-MM-DD`. */
export function todayInBuenosAires(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Fecha larga en español para una fecha civil (YYYY-MM-DD), sin corrimientos. */
export function formatArgentineFullDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map((part) => Number.parseInt(part, 10));
  // Mediodía UTC → mismo día civil en Argentina (UTC-3), evitando saltos de día.
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Hora (0-23) actual en Argentina, para saludos. */
export function hourInBuenosAires(now: Date = new Date()): number {
  const value = new Intl.DateTimeFormat('en-GB', {
    timeZone: AR_TZ,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const hour = Number.parseInt(value, 10);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

/**
 * Interpreta una celda de fecha del Sheet y devuelve `YYYY-MM-DD` o null.
 * Acepta números de serie de Sheets, ISO (`YYYY-MM-DD`) y `DD/MM/YYYY`.
 */
export function parseSheetDate(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const days = Math.trunc(raw) - SHEETS_EPOCH_OFFSET;
    return toYMD(civilFromDays(days));
  }

  if (typeof raw === 'string') {
    const text = raw.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
    if (dmy) {
      const day = pad(Number.parseInt(dmy[1], 10));
      const month = pad(Number.parseInt(dmy[2], 10));
      return `${dmy[3]}-${month}-${day}`;
    }
  }

  return null;
}

/** true si `date` (YYYY-MM-DD) es posterior a `today` (YYYY-MM-DD). */
export function isFutureDate(date: string, today: string): boolean {
  return date > today;
}

/** Lunes de la semana ISO que contiene `ymd` (YYYY-MM-DD), como `YYYY-MM-DD`. */
export function startOfWeekMonday(ymd: string): string {
  const [year, month, day] = ymd.split('-').map((part) => Number.parseInt(part, 10));
  // Zeller-like: días desde época para conocer el día de la semana sin Date/TZ.
  const a = Math.floor((14 - month) / 12);
  const y = year - a;
  const m = month + 12 * a - 2;
  const dow =
    (day +
      y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      Math.floor((31 * m) / 12)) %
    7;
  // dow: 0 = domingo ... 6 = sábado. Días a restar para llegar al lunes.
  const back = (dow + 6) % 7;
  const daysSinceEpoch = daysFromCivil(year, month, day) - back;
  return toYMD(civilFromDays(daysSinceEpoch));
}

/** Días desde 1970-01-01 para una fecha civil (inverso de civilFromDays). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** true si `date` está en el rango [start, end] inclusive (todas YYYY-MM-DD). */
export function isWithin(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}
