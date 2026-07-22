/**
 * Claves opacas deterministas (sin UUID crudo al cliente).
 */
import { createHash } from 'node:crypto';

export function opaqueKey(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

/** Digest de actor: no almacena el correo crudo. */
export function actorDigest(email: string): string {
  return createHash('sha256')
    .update(`vida2-actor:${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

/** Clave de ledger de idempotencia (actor digest + acción + key del cliente). */
export function idempotencyDigest(actorEmail: string, actionType: string, key: string): string {
  return createHash('sha256')
    .update(`${actorDigest(actorEmail)}|${actionType}|${key.trim()}`)
    .digest('hex');
}
