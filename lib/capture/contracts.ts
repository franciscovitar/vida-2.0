import { isConversationalInboxDirectApplyEnabled } from '@/lib/actions/config';
import { BUSINESS_ACTION_TYPES, getAllowedActionMeta } from '@/lib/actions/policy';
import type { ProposedBusinessActionType } from '@/types/actions';

export const CONVERSATIONAL_CAPTURE_CHANNELS = [
  'chatgpt',
  'telegram',
  'whatsapp',
  'other',
] as const;

export type ConversationalCaptureChannel = (typeof CONVERSATIONAL_CAPTURE_CHANNELS)[number];

export type VidaCaptureAuthority =
  'notion-tasks' | 'notion-inbox' | 'sheets-gym' | 'google-calendar-holds';

export type VidaCaptureExecutionMode = 'proposal-only' | 'proposal-or-direct-apply';

export interface VidaConversationalCaptureCapability {
  operation: ProposedBusinessActionType;
  authority: VidaCaptureAuthority;
  /**
   * Direct apply is an additional, action-scoped path. Proposal flow remains available
   * and web data-entry surfaces stay disabled.
   */
  executionMode: VidaCaptureExecutionMode;
  /** Daily data entry is not originated from Vida Web. */
  webOriginatingSurface: false;
  /** Eligibility is static; runtime activation still requires a separate exact feature flag. */
  directApplyEligible: boolean;
}

export type VidaConversationalCaptureCapabilities = readonly VidaConversationalCaptureCapability[];

const CAPABILITIES: Record<ProposedBusinessActionType, VidaConversationalCaptureCapability> = {
  'task.create': {
    operation: 'task.create',
    authority: 'notion-tasks',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEligible: false,
  },
  'task.change-status': {
    operation: 'task.change-status',
    authority: 'notion-tasks',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEligible: false,
  },
  'inbox.capture': {
    operation: 'inbox.capture',
    authority: 'notion-inbox',
    executionMode: 'proposal-or-direct-apply',
    webOriginatingSurface: false,
    directApplyEligible: true,
  },
  'gym.session.create': {
    operation: 'gym.session.create',
    authority: 'sheets-gym',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEligible: false,
  },
  'calendar.hold.create': {
    operation: 'calendar.hold.create',
    authority: 'google-calendar-holds',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEligible: false,
  },
};

export function listVidaConversationalCaptureCapabilities(): VidaConversationalCaptureCapabilities {
  return BUSINESS_ACTION_TYPES.map((operation) => CAPABILITIES[operation]);
}

export function getVidaConversationalCaptureCapability(
  operation: ProposedBusinessActionType,
): VidaConversationalCaptureCapability {
  return CAPABILITIES[operation];
}

export function isVidaConversationalDirectApplyEnabled(
  operation: ProposedBusinessActionType,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const capability = CAPABILITIES[operation];
  if (!capability.directApplyEligible) return false;
  if (operation === 'inbox.capture') return isConversationalInboxDirectApplyEnabled(env);
  return false;
}

/**
 * Policy metadata stays sourced from the canonical Safe Writes Policy Engine.
 * The capture layer must not duplicate risk/confirmation/reversibility rules.
 */
export function getVidaConversationalCapturePolicy(operation: ProposedBusinessActionType) {
  return getAllowedActionMeta(operation);
}
