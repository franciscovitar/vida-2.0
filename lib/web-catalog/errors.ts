/**
 * Errores tipados del Registro Web (planos, sin secretos ni IDs).
 */

export type WebCatalogServiceCode =
  | 'flag-disabled'
  | 'not-configured'
  | 'invalid-catalog'
  | 'not-found'
  | 'forbidden-policy'
  | 'renderer-unimplemented'
  | 'read-error'
  | 'auth-error'
  | 'permission-error'
  | 'rate-limited'
  | 'network-error';

export function webCatalogNoticeFor(code: WebCatalogServiceCode): string {
  const messages: Record<WebCatalogServiceCode, string> = {
    'flag-disabled': 'El Registro Web no está habilitado.',
    'not-configured': 'El Registro Web no está configurado en el servidor.',
    'invalid-catalog': 'El catálogo editorial no es válido y no se publica contenido.',
    'not-found': 'No se encontró el recurso solicitado.',
    'forbidden-policy': 'Este recurso no está disponible en la web.',
    'renderer-unimplemented':
      'Este recurso requiere un renderer especializado todavía no disponible.',
    'read-error': 'No se pudo leer el contenido del Registro Web.',
    'auth-error': 'No se pudo autenticar la lectura del Registro Web.',
    'permission-error': 'Sin permiso de lectura sobre el Registro Web.',
    'rate-limited': 'Notion limitó la lectura del Registro Web.',
    'network-error': 'No se pudo conectar con Notion para el Registro Web.',
  };
  return messages[code];
}

/** Errores que deben conservar semántica 404/privada. */
export function isWebCatalogHiddenFailure(code: WebCatalogServiceCode): boolean {
  return code === 'not-found' || code === 'forbidden-policy' || code === 'flag-disabled';
}

/** Fallos de fuente/configuración que se muestran sin inventar contenido. */
export function isWebCatalogVisibleFailure(code: WebCatalogServiceCode): boolean {
  return !isWebCatalogHiddenFailure(code);
}
