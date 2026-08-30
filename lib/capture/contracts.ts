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
  | 'notion-tasks'
  | 'notion-inbox'
  | 'sheets-gym'
  | 'google-calendar-holds';

export type VidaCaptureExecutionMode = 'proposal-only';

export interface VidaConversationalCaptureCapability {
  operation: ProposedBusinessActionType;
  authority: VidaCaptureAuthority;
  /**
   * Current production contract. Conversational routing must not silently bypass
   * the existing proposal/approval path until a separate policy change is designed,
   * tested and activated.
   */
  executionMode: VidaCaptureExecutionMode;
  /** Daily data entry is not originated from Vida Web. */
  webOriginatingSurface: false;
  /** No current business action is direct-applied by this V1 registry. */
  directApplyEnabled: false;
}

export type VidaConversationalCaptureCapabilities =
  readonly VidaConversationalCaptureCapability[];

const CAPABILITIES: Record<ProposedBusinessActionType, VidaConversationalCaptureCapability> = {
  'task.create': {
    operation: 'task.create',
    authority: 'notion-tasks',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEnabled: false,
  },
  'task.change-status': {
    operation: 'task.change-status',
    authority: 'notion-tasks',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEnabled: false,
  },
  'inbox.capture': {
    operation: 'inbox.capture',
    authority: 'notion-inbox',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEnabled: false,
  },
  'gym.session.create': {
    operation: 'gym.session.create',
    authority: 'sheets-gym',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEnabled: false,
  },
  'calendar.hold.create': {
    operation: 'calendar.hold.create',
    authority: 'google-calendar-holds',
    executionMode: 'proposal-only',
    webOriginatingSurface: false,
    directApplyEnabled: false,
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

/**
 * Policy metadata stays sourced from the canonical Safe Writes Policy Engine.
 * The capture layer must not duplicate risk/confirmation/reversibility rules.
 */
export function getVidaConversationalCapturePolicy(operation: ProposedBusinessActionType) {
  return getAllowedActionMeta(operation);
}
