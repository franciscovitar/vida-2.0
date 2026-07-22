/**
 * Policy Engine tipado — única puerta de autorización de acciones.
 */
import type {
  ActionConfirmation,
  ActionPolicyDecision,
  ActionType,
  AllowedActionType,
  ForbiddenActionType,
} from '@/types/actions';

const ALLOWED: readonly AllowedActionType[] = [
  'task.create',
  'task.change-status',
  'inbox.capture',
  'gym.session.create',
  'proposal.create',
  'proposal.approve',
  'proposal.reject',
] as const;

const FORBIDDEN: readonly ForbiddenActionType[] = [
  'content.delete',
  'content.archive',
  'content.merge',
  'architecture.change',
  'rules.change',
  'journaling.read',
  'journaling.write',
  'message.send',
  'purchase.execute',
  'credentials.modify',
  'calendar.event.create',
  'medical.conclusive.write',
] as const;

const META: Record<
  AllowedActionType,
  { confirmation: 'explicit' | 'reinforced'; risk: 'low' | 'medium' | 'high'; reversible: boolean }
> = {
  'task.create': { confirmation: 'explicit', risk: 'medium', reversible: false },
  'task.change-status': { confirmation: 'explicit', risk: 'low', reversible: true },
  'inbox.capture': { confirmation: 'explicit', risk: 'low', reversible: false },
  'gym.session.create': { confirmation: 'explicit', risk: 'medium', reversible: false },
  'proposal.create': { confirmation: 'explicit', risk: 'low', reversible: true },
  'proposal.approve': { confirmation: 'reinforced', risk: 'high', reversible: false },
  'proposal.reject': { confirmation: 'explicit', risk: 'low', reversible: true },
};

export function isAllowedActionType(value: string): value is AllowedActionType {
  return (ALLOWED as readonly string[]).includes(value);
}

export function isForbiddenActionType(value: string): value is ForbiddenActionType {
  return (FORBIDDEN as readonly string[]).includes(value);
}

export function listAllowedActionTypes(): readonly AllowedActionType[] {
  return ALLOWED;
}

export function listForbiddenActionTypes(): readonly ForbiddenActionType[] {
  return FORBIDDEN;
}

export function evaluateActionPolicy(input: {
  actionType: string;
  writesEnabled: boolean;
  authenticated: boolean;
  confirmation: ActionConfirmation | null;
}): ActionPolicyDecision {
  if (!input.writesEnabled) {
    return {
      ok: false,
      code: 'flag-disabled',
      message: 'Las escrituras están desactivadas (WRITE_ACTIONS_ENABLED).',
    };
  }
  if (!input.authenticated) {
    return {
      ok: false,
      code: 'unauthenticated',
      message: 'Tenés que iniciar sesión para ejecutar acciones.',
    };
  }
  if (isForbiddenActionType(input.actionType)) {
    return {
      ok: false,
      code: 'forbidden-action',
      message: `La acción "${input.actionType}" está prohibida.`,
    };
  }
  if (!isAllowedActionType(input.actionType)) {
    return {
      ok: false,
      code: 'unknown-action',
      message: `La acción "${input.actionType}" no está registrada.`,
    };
  }

  const meta = META[input.actionType];
  if (!input.confirmation || !input.confirmation.acknowledged) {
    return {
      ok: false,
      code: 'confirmation-missing',
      message: 'Se requiere confirmación explícita.',
    };
  }
  if (meta.confirmation === 'reinforced') {
    if (input.confirmation.mode !== 'reinforced') {
      return {
        ok: false,
        code: 'confirmation-insufficient',
        message: 'Esta acción exige confirmación reforzada.',
      };
    }
    if ((input.confirmation.phrase ?? '').trim().toLowerCase() !== 'aprobar') {
      return {
        ok: false,
        code: 'confirmation-insufficient',
        message: 'Confirmación reforzada inválida (escribí “aprobar”).',
      };
    }
  }

  return {
    ok: true,
    actionType: input.actionType,
    confirmationRequired: meta.confirmation,
    risk: meta.risk,
    reversible: meta.reversible,
  };
}

/** Protege contra ActionType inventados en runtime. */
export function assertActionType(value: string): ActionType | null {
  return isAllowedActionType(value) ? value : null;
}
