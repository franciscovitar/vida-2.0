import { mediaPublicKey } from '@/lib/media/key';
import type { MediaFocusLevel, MediaKind } from '@/types/media';

type PlainCell = string | number | boolean | null;

export interface ManualFocusRequest {
  key: string;
  medium: MediaKind;
  level: MediaFocusLevel | null;
}

export type ManualFocusTargetResult =
  | { ok: true; rowNumber: number; columnNumber: number }
  | { ok: false; code: 'missing-header' | 'not-found' | 'conflict' | 'invalid-state' };

function text(value: PlainCell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function yearValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function parseManualFocusRequest(value: unknown): ManualFocusRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.medium !== 'movie' && input.medium !== 'series') return null;
  if (typeof input.key !== 'string') return null;
  const key = input.key.trim();
  if (!key || key.length > 512) return null;
  const level = input.level;
  if (level !== null && level !== 1 && level !== 2 && level !== 3) return null;
  return { key, medium: input.medium, level };
}

export function resolveManualFocusTarget(
  medium: MediaKind,
  values: PlainCell[][],
  publicKey: string,
): ManualFocusTargetResult {
  const header = values[0] ?? [];
  const titleColumn = header.findIndex((cell) => text(cell) === 'Título');
  const yearColumn = header.findIndex((cell) => text(cell) === 'Año');
  const stateColumn = header.findIndex((cell) => text(cell) === 'Estado');
  const manualColumn = header.findIndex((cell) => text(cell) === 'Lote manual');

  if (titleColumn < 0 || yearColumn < 0 || stateColumn < 0 || manualColumn < 0) {
    return { ok: false, code: 'missing-header' };
  }

  const matches: { rowNumber: number; state: string | null }[] = [];
  values.slice(1).forEach((row, index) => {
    const title = text(row[titleColumn]);
    if (!title) return;
    const key = mediaPublicKey(medium, title, yearValue(row[yearColumn]));
    if (key === publicKey) {
      matches.push({ rowNumber: index + 2, state: text(row[stateColumn]) });
    }
  });

  if (matches.length === 0) return { ok: false, code: 'not-found' };
  if (matches.length !== 1) return { ok: false, code: 'conflict' };
  if (matches[0]?.state !== 'Por ver') return { ok: false, code: 'invalid-state' };

  return { ok: true, rowNumber: matches[0].rowNumber, columnNumber: manualColumn + 1 };
}

export function columnNumberToA1(columnNumber: number): string {
  if (!Number.isInteger(columnNumber) || columnNumber < 1) {
    throw new Error('Invalid column number');
  }
  let current = columnNumber;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}
