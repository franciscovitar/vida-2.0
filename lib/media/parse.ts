import type { MediaTab } from '@/lib/media/sheets-read';
import type { MediaKind, MediaTitleView } from '@/types/media';

type PlainCell = string | number | boolean | null;
type PlainRows = PlainCell[][];

export type MediaParseResult =
  { ok: true; titles: MediaTitleView[] } | { ok: false; missing: string[] };

const COMMON_HEADERS = [
  'Título',
  'Título original',
  'Año',
  'Estado',
  'Tier banco',
  'Pool',
  'Radar',
  'Nota',
  'Géneros',
  'País',
  'Afinidad personal',
  'Valor cinéfilo',
  'Impacto cultural',
  'Score general',
  'Por qué para mí',
] as const;

const MOVIE_HEADERS = [...COMMON_HEADERS, 'Director', 'Duración min'] as const;
const SERIES_HEADERS = [
  ...COMMON_HEADERS,
  'Creador / showrunner',
  'Duración episodio min',
  'Temporadas',
] as const;

function text(value: PlainCell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function numberValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: PlainCell | undefined): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function listValue(value: PlainCell | undefined): string[] {
  const raw = text(value);
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isRadar(value: PlainCell | undefined): boolean {
  const normalized = text(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return normalized === 'si' || normalized === 'yes' || normalized === 'true';
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
  indexes: Map<string, number>,
  header: string,
): PlainCell | undefined {
  const index = indexes.get(header);
  return index === undefined ? undefined : row[index];
}

export function parseMediaTab(tab: MediaTab, values: PlainRows): MediaParseResult {
  const medium: MediaKind = tab === 'Movies' ? 'movie' : 'series';
  const required = tab === 'Movies' ? MOVIE_HEADERS : SERIES_HEADERS;
  const indexes = headerIndexes(values[0] ?? []);
  const missing = required.filter((header) => !indexes.has(header));
  if (missing.length > 0) return { ok: false, missing: [...missing] };

  const titles: MediaTitleView[] = [];

  for (const row of values.slice(1)) {
    const title = text(valueAt(row, indexes, 'Título'));
    if (!title) continue;

    const year = integerValue(valueAt(row, indexes, 'Año'));
    const creatorHeader = medium === 'movie' ? 'Director' : 'Creador / showrunner';
    const runtimeHeader = medium === 'movie' ? 'Duración min' : 'Duración episodio min';

    titles.push({
      key: `${medium}:${title}:${year ?? 'sin-año'}`,
      medium,
      title,
      originalTitle: text(valueAt(row, indexes, 'Título original')),
      year,
      state: text(valueAt(row, indexes, 'Estado')) ?? 'Sin estado',
      bankTier: text(valueAt(row, indexes, 'Tier banco')),
      pool: text(valueAt(row, indexes, 'Pool')),
      radar: isRadar(valueAt(row, indexes, 'Radar')),
      rating: numberValue(valueAt(row, indexes, 'Nota')),
      creator: text(valueAt(row, indexes, creatorHeader)),
      genres: listValue(valueAt(row, indexes, 'Géneros')),
      countries: listValue(valueAt(row, indexes, 'País')),
      runtimeMinutes: numberValue(valueAt(row, indexes, runtimeHeader)),
      seasons: medium === 'series' ? integerValue(valueAt(row, indexes, 'Temporadas')) : null,
      affinity: numberValue(valueAt(row, indexes, 'Afinidad personal')),
      cinephileValue: numberValue(valueAt(row, indexes, 'Valor cinéfilo')),
      culturalImpact: numberValue(valueAt(row, indexes, 'Impacto cultural')),
      generalScore: numberValue(valueAt(row, indexes, 'Score general')),
      whyForMe: text(valueAt(row, indexes, 'Por qué para mí')),
    });
  }

  return { ok: true, titles };
}
