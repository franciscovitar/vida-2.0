/**
 * Códigos planos de error Notion (sin Error del SDK ni secretos).
 */

export type NotionReadCode =
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-data-source'
  | 'missing-property'
  | 'rate-limited'
  | 'network-error'
  | 'forbidden-data-source'
  | 'read-error';

export type NotionQueryResult<T> = { ok: true; pages: T[] } | { ok: false; code: NotionReadCode };

export function notionNoticeFor(
  code: Exclude<NotionReadCode, 'forbidden-data-source'> | 'empty',
): string {
  const messages: Record<typeof code, string> = {
    'not-configured': 'Integración con Notion no configurada. Mostrando datos simulados.',
    'auth-error': 'No se pudo autenticar con Notion. Mostrando datos simulados.',
    'permission-error': 'Sin permiso de lectura en Notion. Mostrando datos simulados.',
    'missing-data-source': 'Falta un data source esperado en Notion. Mostrando datos simulados.',
    'missing-property': 'Faltan propiedades esperadas en Notion. Mostrando datos simulados.',
    'rate-limited': 'Notion limitó la lectura. Mostrando datos simulados.',
    'network-error': 'No se pudo conectar con Notion. Mostrando datos simulados.',
    'read-error': 'No se pudieron leer los datos de Notion. Mostrando datos simulados.',
    empty: 'No hay registros en las bases de Notion para este momento.',
  };
  return messages[code];
}

/** Mapea fallos del SDK a códigos planos (nunca expone el error crudo). */
export function mapNotionFailure(error: unknown): NotionReadCode {
  if (!error || typeof error !== 'object') return 'read-error';
  const status =
    'status' in error && typeof (error as { status: unknown }).status === 'number'
      ? (error as { status: number }).status
      : null;
  const code =
    'code' in error && typeof (error as { code: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';

  if (status === 401 || code === 'unauthorized') return 'auth-error';
  if (status === 403 || code === 'restricted_resource') return 'permission-error';
  if (status === 404 || code === 'object_not_found') return 'missing-data-source';
  if (status === 429 || code === 'rate_limited') return 'rate-limited';
  if (code === 'notionhq_client_request_timeout' || code === 'service_unavailable') {
    return 'network-error';
  }
  return 'read-error';
}
