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

/** Construye un ActionRequest desde principal server-side (nunca desde el body). */
export function requestFromOpenClawPrincipal(
  agentId: OpenClawAgentId,
  principalId: string,
  partial: Omit<ActionRequest, 'actorHash' | 'actorHint'> &
    Partial<Pick<ActionRequest, 'actorHash' | 'actorHint'>>,
): ActionRequest {
  const principal = principalId.trim() || `agent:${agentId}`;
  const actorHash = partial.actorHash ?? actorHashFromOpenClawKeyId(principal);
  return {
    ...partial,
    actorHash,
    actorHint: partial.actorHint ?? `openclaw:${actorHash.slice(0, 8)}`,
  };
}

/** Construye un ActionRequest desde AgentId canónico (nunca desde el body). */
export function requestFromOpenClawAgentId(
  agentId: OpenClawAgentId,
  partial: Omit<ActionRequest, 'actorHash' | 'actorHint'> &
    Partial<Pick<ActionRequest, 'actorHash' | 'actorHint'>>,
): ActionRequest {
  return requestFromOpenClawPrincipal(agentId, `agent:${agentId}`, partial);
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
