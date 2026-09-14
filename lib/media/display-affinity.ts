import { adjustEstimatedAffinity, shouldSurfaceEstimatedAffinity } from '@/lib/media/focus';
import { mediaPublicKey } from '@/lib/media/key';
import type { MediaKind, MediaTitleView } from '@/types/media';

type PlainCell = string | number | boolean | null;
type PlainRows = PlainCell[][];

export type DisplayAffinityParseResult =
  | { ok: true; byTitle: Map<string, number> }
  | { ok: false; missing: string[] };

const REQUIRED_HEADERS = ['Tipo', 'Título', 'Año', 'Afinidad display', 'Modelo', 'Modo'] as const;
const MODEL_VERSION = 'personal-fit-v1.2';
const MODE = 'current_catalog_display_fallback';

function text(value: PlainCell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function numberValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: PlainCell | undefined): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function headerIndexes(headerRow: PlainCell[]): Map<string, number> {
  const indexes = new Map<string, number>();
  headerRow.forEach((value, index) => {
    const label = text(value);
    if (label) indexes.set(label, index);
  });
  return indexes;
}

function valueAt(
  row: PlainCell[],
  indexes: ReadonlyMap<string, number>,
  header: string,
): PlainCell | undefined {
  const index = indexes.get(header);
  return index === undefined ? undefined : row[index];
}

function mediaKind(value: PlainCell | undefined): MediaKind | null {
  const raw = text(value);
  return raw === 'movie' || raw === 'series' ? raw : null;
}

export function parseDisplayAffinity(values: PlainRows): DisplayAffinityParseResult {
  const indexes = headerIndexes(values[0] ?? []);
  const missing = REQUIRED_HEADERS.filter((header) => !indexes.has(header));
  if (missing.length > 0) return { ok: false, missing: [...missing] };

  const byTitle = new Map<string, number>();

  for (const row of values.slice(1)) {
    const medium = mediaKind(valueAt(row, indexes, 'Tipo'));
    const title = text(valueAt(row, indexes, 'Título'));
    const affinity = numberValue(valueAt(row, indexes, 'Afinidad display'));
    const model = text(valueAt(row, indexes, 'Modelo'));
    const mode = text(valueAt(row, indexes, 'Modo'));
    if (!medium || !title || affinity === null || affinity < 0 || affinity > 10) continue;
    if (model !== MODEL_VERSION || mode !== MODE) continue;

    const year = integerValue(valueAt(row, indexes, 'Año'));
    const key = mediaPublicKey(medium, title, year);
    if (!byTitle.has(key)) byTitle.set(key, affinity);
  }

  return { ok: true, byTitle };
}

/**
 * Último fallback de presentación. Nunca reemplaza una predicción privada o
 * retrospectiva ya aplicada y respeta la política de ocultar Personal Fit en
 * películas ya vistas.
 */
export function withDisplayAffinity(
  titles: MediaTitleView[],
  byTitle: ReadonlyMap<string, number>,
): MediaTitleView[] {
  if (byTitle.size === 0) return titles;

  return titles.map((item) => {
    if (item.estimatedAffinity !== null || !shouldSurfaceEstimatedAffinity(item)) return item;
    const rawAffinity = byTitle.get(item.key);
    if (rawAffinity === undefined) return item;

    return {
      ...item,
      estimatedAffinity: adjustEstimatedAffinity(item.medium, item.ageFeelScore, rawAffinity),
    };
  });
}
