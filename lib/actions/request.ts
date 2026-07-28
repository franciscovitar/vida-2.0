/**
 * Helpers de construcción de ActionRequest (tests / callers transicionales).
 */
import { sanitizeActorHint } from '@/lib/actions/audit';
import { actorHashFromEmail, actorHashFromOpenClawKeyId } from '@/lib/actions/opaque';
import type { ActionRequest } from '@/types/actions';

/** Construye un ActionRequest hasheando email → actorHash + actorHint sanitizado. */
export function requestFromEmail(
  email: string,
  partial: Omit<ActionRequest, 'actorHash' | 'actorHint'> &
    Partial<Pick<ActionRequest, 'actorHash' | 'actorHint'>>,
): ActionRequest {
  const trimmed = email.trim();
  return {
    ...partial,
    actorHash: partial.actorHash ?? (trimmed ? actorHashFromEmail(trimmed) : ''),
    actorHint: partial.actorHint ?? (trimmed ? sanitizeActorHint(trimmed) : 'user'),
  };
}

/** Construye un ActionRequest desde keyId OpenClaw. */
export function requestFromOpenClawKeyId(
  keyId: string,
  partial: Omit<ActionRequest, 'actorHash' | 'actorHint'> &
    Partial<Pick<ActionRequest, 'actorHash' | 'actorHint'>>,
): ActionRequest {
  const trimmed = keyId.trim();
  return {
    ...partial,
    actorHash: partial.actorHash ?? (trimmed ? actorHashFromOpenClawKeyId(trimmed) : ''),
    actorHint:
      partial.actorHint ?? (trimmed ? sanitizeActorHint(`openclaw:${trimmed}`) : 'openclaw:***'),
  };
}
