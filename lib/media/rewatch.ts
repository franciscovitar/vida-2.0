import type { MediaKind } from '@/types/media';

export interface MediaRewatchRequest {
  key: string;
  medium: MediaKind;
  enabled: boolean;
}

export function rewatchBaseState(medium: MediaKind): 'Vista' | 'Terminada' {
  return medium === 'movie' ? 'Vista' : 'Terminada';
}

export function rewatchTargetState(
  medium: MediaKind,
  enabled: boolean,
): 'Reveer' | 'Vista' | 'Terminada' {
  return enabled ? 'Reveer' : rewatchBaseState(medium);
}

export function canToggleRewatch(
  medium: MediaKind,
  currentState: string,
  enabled: boolean,
): boolean {
  const baseState = rewatchBaseState(medium);
  const targetState = rewatchTargetState(medium, enabled);
  if (currentState === targetState) return true;
  return currentState === baseState || currentState === 'Reveer';
}

export function parseMediaRewatchRequest(value: unknown): MediaRewatchRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.medium !== 'movie' && input.medium !== 'series') return null;
  if (typeof input.key !== 'string' || typeof input.enabled !== 'boolean') return null;

  const key = input.key.trim();
  if (!key || key.length > 512) return null;

  return {
    key,
    medium: input.medium,
    enabled: input.enabled,
  };
}
