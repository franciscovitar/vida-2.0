/** Utilidades de formato en español, deterministas para evitar desajustes SSR. */

const LOCALE = 'es-AR';

/** Fecha completa: "lunes, 20 de julio de 2026". */
export function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Hora corta a partir de "HH:mm". Se mantiene el formato 24h. */
export function formatTime(time: string): string {
  return time;
}

/** Convierte minutos a "7 h 40 min", "45 min" o "0 min". */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** Convierte minutos a horas con un decimal, p. ej. 7,7. */
export function minutesToHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 10) / 10;
}

/** Diferencia relativa entre dos valores en minutos, con signo. */
export function diffLabel(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return 'igual que ayer';
  const sign = diff > 0 ? '+' : '−';
  return `${sign}${formatDuration(Math.abs(diff))} vs ayer`;
}

/** Formatea un entero con separador de miles en es-AR. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}
