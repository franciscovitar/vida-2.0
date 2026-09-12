import type { MediaKind } from '@/types/media';

export function mediaPublicKey(
  medium: MediaKind,
  title: string,
  year: number | null,
): string {
  return `${medium}:${title.trim()}:${year ?? 'sin-año'}`;
}
