/**
 * Claves opacas deterministas (sin UUID crudo al cliente).
 */
import { createHash } from 'node:crypto';

export function opaqueKey(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

/** Digest de actor desde email (transicional; preferir actorHashFromEmail). */
export function actorDigest(email: string): string {
  return actorHashFromEmail(email);
}

/** Hash opaco de actor a partir de email (nunca persistir el email). */
export function actorHashFromEmail(email: string): string {
  return createHash('sha256')
    .update(`vida2-actor:${email.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

/** Hash opaco de actor a partir de keyId OpenClaw. */
export function actorHashFromOpenClawKeyId(keyId: string): string {
  return createHash('sha256')
    .update(`vida2-openclaw-actor:${keyId.trim()}`)
    .digest('hex')
    .slice(0, 32);
}

/** Digest de idempotencia a partir de actorHash (preferido). */
export function idempotencyDigestFromActorHash(
  actorHash: string,
  actionType: string,
  key: string,
): string {
  return createHash('sha256')
    .update(`${actorHash.trim()}|${actionType}|${key.trim()}`)
    .digest('hex');
}

/**
 * Digest de idempotencia (compat): acepta email o hash ya calculado.
 * Si el valor parece un hash hex de 32 chars, se usa directo; si no, se hashea como email.
 */
export function idempotencyDigest(actor: string, actionType: string, key: string): string {
  const trimmed = actor.trim();
  const hash =
    /^[a-f0-9]{32}$/i.test(trimmed) && !trimmed.includes('@')
      ? trimmed.toLowerCase()
      : actorHashFromEmail(trimmed);
  return idempotencyDigestFromActorHash(hash, actionType, key);
}

/** Hash opaco para claves de coordinación (env + partes). */
export function coordinationKeyHash(parts: readonly string[]): string {
  return createHash('sha256')
    .update(`vida2-coord:${parts.map((part) => part.trim()).join('|')}`)
    .digest('hex');
}

/** Digest determinista de plaintext JSON (ordenado por serialización del caller). */
export function payloadDigestFromPlaintext(plaintextJson: string): string {
  return createHash('sha256').update(plaintextJson).digest('hex');
}
