/**
 * Punto de entrada server-only para lectura del Sheet DEV.
 *
 * Reexporta la implementación de `sheets-read.ts` (fetch + JWT, sin gaxios)
 * y bloquea importaciones desde componentes cliente.
 */
import 'server-only';

export { mapGoogleFailure, readTabValues } from './sheets-read';
