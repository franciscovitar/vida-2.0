/**
 * Helpers de construcción de ActionRequest (tests / callers transicionales).
 */
import { sanitizeActorHint } from '@/lib/actions/audit';
import { actorHashFromEmail, actorHashFromOpenClawKeyId } from '@/lib/actions/opaque';
import type { ActionRequest } from '@/types/actions';
import type { OpenClawAgentId } from '@/types/openclaw';

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

/** Construye un ActionRequest desde AgentId canónico (nunca desde el body). */
export function requestFromOpenClawAgentId(
  agentId: OpenClawAgentId,
  partial: Omit<ActionRequest, 'actorHash' | 'actorHint'> &
    Partial<Pick<ActionRequest, 'actorHash' | 'actorHint'>>,
): ActionRequest {
  const principal = `agent:${agentId}`;
  return {
    ...partial,
    actorHash: partial.actorHash ?? actorHashFromOpenClawKeyId(principal),
    actorHint: partial.actorHint ?? sanitizeActorHint(principal),
  };
}

/** Construye un ActionRequest desde keyId OpenClaw. @deprecated Block 4 usa AgentId. */
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
