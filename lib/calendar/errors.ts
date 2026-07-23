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
    'not-configured':
      'Integración con Google Calendar no configurada. La agenda permanece vacía hasta resolverlo.',
    'auth-error': 'No se pudo autenticar con Google Calendar. No se muestran eventos simulados.',
    'permission-error':
      'Sin permiso de lectura en Google Calendar. No se muestran eventos simulados.',
    'invalid-calendar-id':
      'Hay un ID de calendario inválido en la configuración. La agenda permanece vacía.',
    'calendar-not-found': 'No se encontró un calendario autorizado. La agenda permanece vacía.',
    'rate-limited': 'Google Calendar limitó la lectura temporalmente. La agenda permanece vacía.',
    'network-error': 'No se pudo conectar con Google Calendar. La agenda permanece vacía.',
    'read-error': 'No se pudieron leer los eventos de Calendar. La agenda permanece vacía.',
    empty: 'No hay eventos en el período seleccionado.',
  };
  return messages[code];
}

/** Avisos para Hoy: sin inyectar mocks ni afirmar datos simulados. */
export function calendarHoyNoticeFor(code: CalendarReadCode): string {
  const messages: Record<CalendarReadCode, string> = {
    'not-configured': 'Integración con Google Calendar no configurada.',
    'auth-error': 'No se pudo autenticar con Google Calendar.',
    'permission-error': 'Sin permiso de lectura en Google Calendar.',
    'invalid-calendar-id': 'Hay un ID de calendario inválido en la configuración.',
    'calendar-not-found': 'No se encontró un calendario autorizado.',
    'rate-limited': 'Google Calendar limitó la lectura temporalmente.',
    'network-error': 'No se pudo conectar con Google Calendar.',
    'read-error': 'No se pudieron leer los eventos de Calendar.',
  };
  return messages[code];
}

/** true si Calendar no aporta datos utilizables en Hoy (fallback / error). */
export function isCalendarHoyUnavailable(status: string): boolean {
  return status !== 'ready' && status !== 'empty' && status !== 'mock';
}

/** Mapea status HTTP de Calendar REST a código plano. */
export function mapCalendarHttpStatus(status: number, bodyText = ''): CalendarReadCode {
  const lower = bodyText.toLowerCase();
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  if (status === 404 || lower.includes('notfound') || lower.includes('not found')) {
    return 'calendar-not-found';
  }
  if (status === 429) return 'rate-limited';
  return 'read-error';
}

/**
 * Extrae un status numérico de un error desconocido sin clonar Buffer/ArrayBuffer.
 * Nunca retiene cause, response ni el error original.
 */
export function extractCalendarErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  try {
    if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
      return (error as { status: number }).status;
    }
    if (
      'response' in error &&
      (error as { response?: unknown }).response &&
      typeof (error as { response: unknown }).response === 'object'
    ) {
      const response = (error as { response: { status?: unknown } }).response;
      if (typeof response.status === 'number') return response.status;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Mapea fallos a códigos planos.
 * Nunca expone Error, GaxiosError, cause, Buffer ni ArrayBuffer.
 */
export function mapCalendarFailure(error: unknown): CalendarReadCode {
  const status = extractCalendarErrorStatus(error);
  if (status !== null) return mapCalendarHttpStatus(status);

  if (error && typeof error === 'object') {
    try {
      const code =
        'code' in error && typeof (error as { code: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';
      if (code === '401' || code === 'invalid_grant') return 'auth-error';
      if (code === '403') return 'permission-error';
      if (code === '404') return 'calendar-not-found';
      if (code === '429') return 'rate-limited';
      if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND') {
        return 'network-error';
      }
    } catch {
      return 'read-error';
    }
  }
  return 'read-error';
}
