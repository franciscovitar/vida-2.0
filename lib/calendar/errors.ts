/**
 * Códigos planos de error Calendar (sin Error del SDK ni secretos).
 */

export type CalendarReadCode =
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'invalid-calendar-id'
  | 'calendar-not-found'
  | 'rate-limited'
  | 'network-error'
  | 'read-error';

export type CalendarQueryResult<T> =
  { ok: true; events: T[] } | { ok: false; code: CalendarReadCode };

export function calendarNoticeFor(code: CalendarReadCode | 'empty'): string {
  const messages: Record<CalendarReadCode | 'empty', string> = {
    'not-configured': 'Integración con Google Calendar no configurada. Mostrando datos simulados.',
    'auth-error': 'No se pudo autenticar con Google Calendar. Mostrando datos simulados.',
    'permission-error': 'Sin permiso de lectura en Google Calendar. Mostrando datos simulados.',
    'invalid-calendar-id':
      'Hay un ID de calendario inválido en la configuración. Mostrando datos simulados.',
    'calendar-not-found': 'No se encontró un calendario autorizado. Mostrando datos simulados.',
    'rate-limited': 'Google Calendar limitó la lectura. Mostrando datos simulados.',
    'network-error': 'No se pudo conectar con Google Calendar. Mostrando datos simulados.',
    'read-error': 'No se pudieron leer los eventos de Calendar. Mostrando datos simulados.',
    empty: 'No hay eventos en el período seleccionado.',
  };
  return messages[code];
}

/** Mapea fallos de googleapis/gaxios a códigos planos (nunca expone el error crudo). */
export function mapCalendarFailure(error: unknown): CalendarReadCode {
  if (!error || typeof error !== 'object') return 'read-error';
  const status =
    'status' in error && typeof (error as { status: unknown }).status === 'number'
      ? (error as { status: number }).status
      : 'response' in error &&
          typeof (error as { response?: { status?: unknown } }).response?.status === 'number'
        ? ((error as { response: { status: number } }).response.status as number)
        : null;
  const code =
    'code' in error && typeof (error as { code: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  const message =
    'message' in error && typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message.toLowerCase()
      : '';

  if (status === 401 || code === '401' || message.includes('invalid_grant')) return 'auth-error';
  if (status === 403 || code === '403') return 'permission-error';
  if (status === 404 || code === '404' || message.includes('notfound')) {
    return 'calendar-not-found';
  }
  if (status === 429 || code === '429') return 'rate-limited';
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND') {
    return 'network-error';
  }
  return 'read-error';
}
