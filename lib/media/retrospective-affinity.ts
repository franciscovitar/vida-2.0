import { mediaPublicKey } from '@/lib/media/key';
import type { MediaTitleView } from '@/types/media';

type PlainCell = string | number | boolean | null;
type PlainRows = PlainCell[][];

export type RetrospectiveAffinityParseResult =
  | { ok: true; bySeries: Map<string, number> }
  | { ok: false; missing: string[] };

const REQUIRED_HEADERS = [
  'Título serie',
  'Año serie',
  'Afinidad retrospectiva',
  'Modelo',
  'Modo',
] as const;

const MODEL_VERSION = 'personal-fit-v1.2-retrospective-display-v1';
const MODE = 'retrospective_leave_one_out';

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

export function parseRetrospectiveSeriesAffinity(
  values: PlainRows,
): RetrospectiveAffinityParseResult {
  const indexes = headerIndexes(values[0] ?? []);
  const missing = REQUIRED_HEADERS.filter((header) => !indexes.has(header));
  if (missing.length > 0) return { ok: false, missing: [...missing] };

  const bySeries = new Map<string, number>();

  for (const row of values.slice(1)) {
    const title = text(valueAt(row, indexes, 'Título serie'));
    const affinity = numberValue(valueAt(row, indexes, 'Afinidad retrospectiva'));
    const model = text(valueAt(row, indexes, 'Modelo'));
    const mode = text(valueAt(row, indexes, 'Modo'));
    if (!title || affinity === null || affinity < 0 || affinity > 10) continue;
    if (model !== MODEL_VERSION || mode !== MODE) continue;

    const year = integerValue(valueAt(row, indexes, 'Año serie'));
    const key = mediaPublicKey('series', title, year);
    if (!bySeries.has(key)) bySeries.set(key, affinity);
  }

  return { ok: true, bySeries };
}

/**
 * Fallback exclusivamente retrospectivo para Series. Una predicción privada
 * prospectiva ya aplicada siempre gana. Movies nunca consumen esta capa.
 */
export function withRetrospectiveSeriesAffinity(
  titles: MediaTitleView[],
  bySeries: ReadonlyMap<string, number>,
): MediaTitleView[] {
  if (bySeries.size === 0) return titles;

  return titles.map((item) => {
    if (item.medium !== 'series' || item.estimatedAffinity !== null) return item;
    const affinity = bySeries.get(item.key);
    return affinity === undefined ? item : { ...item, estimatedAffinity: affinity };
  });
}
