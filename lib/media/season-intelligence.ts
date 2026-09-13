import { mediaPublicKey } from '@/lib/media/key';
import { clampSeasonAffinity } from '@/lib/media/seasons';
import type { MediaSeasonEvidenceState, MediaSeasonView, MediaTitleView } from '@/types/media';

type PlainCell = string | number | boolean | null;
type PlainRows = PlainCell[][];

interface SeasonIntelligenceRow {
  seasonNumber: number;
  year: number | null;
  episodeCount: number | null;
  cinephileValue: number | null;
  culturalPresence: number | null;
  affinityAdjustment: number | null;
  scoreVersion: string | null;
  evidenceState: MediaSeasonEvidenceState;
}

export type SeasonIntelligenceParseResult =
  { ok: true; bySeries: Map<string, SeasonIntelligenceRow[]> } | { ok: false; missing: string[] };

const REQUIRED_HEADERS = [
  'Título serie',
  'Año serie',
  'Temporada',
  'Año temporada',
  'Episodios',
  'Valor cinéfilo',
  'Presencia cultural',
  'Ajuste afinidad',
  'Score versión',
  'Estado evidencia',
] as const;

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
  indexes: Map<string, number>,
  header: string,
): PlainCell | undefined {
  const index = indexes.get(header);
  return index === undefined ? undefined : row[index];
}

function evidenceState(value: PlainCell | undefined): MediaSeasonEvidenceState {
  const raw = text(value)?.toLocaleLowerCase('es-AR');
  if (raw === 'ready') return 'ready';
  if (raw === 'partial') return 'partial';
  return 'unavailable';
}

function boundedScore(value: PlainCell | undefined): number | null {
  const parsed = numberValue(value);
  if (parsed === null || parsed < 0 || parsed > 10) return null;
  return parsed;
}

function boundedAdjustment(value: PlainCell | undefined): number | null {
  const parsed = numberValue(value);
  if (parsed === null || parsed < -2 || parsed > 2) return null;
  return parsed;
}

export function parseSeasonIntelligence(values: PlainRows): SeasonIntelligenceParseResult {
  const indexes = headerIndexes(values[0] ?? []);
  const missing = REQUIRED_HEADERS.filter((header) => !indexes.has(header));
  if (missing.length > 0) return { ok: false, missing: [...missing] };

  const bySeries = new Map<string, SeasonIntelligenceRow[]>();

  for (const row of values.slice(1)) {
    const title = text(valueAt(row, indexes, 'Título serie'));
    const seasonNumber = integerValue(valueAt(row, indexes, 'Temporada'));
    if (!title || seasonNumber === null || seasonNumber < 1) continue;

    const seriesYear = integerValue(valueAt(row, indexes, 'Año serie'));
    const key = mediaPublicKey('series', title, seriesYear);
    const current = bySeries.get(key) ?? [];
    current.push({
      seasonNumber,
      year: integerValue(valueAt(row, indexes, 'Año temporada')),
      episodeCount: integerValue(valueAt(row, indexes, 'Episodios')),
      cinephileValue: boundedScore(valueAt(row, indexes, 'Valor cinéfilo')),
      culturalPresence: boundedScore(valueAt(row, indexes, 'Presencia cultural')),
      affinityAdjustment: boundedAdjustment(valueAt(row, indexes, 'Ajuste afinidad')),
      scoreVersion: text(valueAt(row, indexes, 'Score versión')),
      evidenceState: evidenceState(valueAt(row, indexes, 'Estado evidencia')),
    });
    bySeries.set(key, current);
  }

  for (const rows of bySeries.values()) {
    rows.sort((left, right) => left.seasonNumber - right.seasonNumber);
  }

  return { ok: true, bySeries };
}

function mergeSeason(
  base: MediaSeasonView | undefined,
  intel: SeasonIntelligenceRow | undefined,
  seriesAffinity: number | null,
  seasonNumber: number,
): MediaSeasonView {
  return {
    seasonNumber,
    year: intel?.year ?? base?.year ?? null,
    episodeCount: intel?.episodeCount ?? base?.episodeCount ?? null,
    observedRating: base?.observedRating ?? null,
    estimatedAffinity: clampSeasonAffinity(seriesAffinity, intel?.affinityAdjustment ?? null),
    cinephileValue: intel?.cinephileValue ?? base?.cinephileValue ?? null,
    culturalPresence: intel?.culturalPresence ?? base?.culturalPresence ?? null,
    scoreVersion: intel?.scoreVersion ?? base?.scoreVersion ?? null,
    evidenceState: intel?.evidenceState ?? base?.evidenceState ?? 'unavailable',
  };
}

export function withSeasonIntelligence(
  titles: MediaTitleView[],
  bySeries: ReadonlyMap<string, SeasonIntelligenceRow[]>,
): MediaTitleView[] {
  return titles.map((item) => {
    if (item.medium !== 'series') return item;

    const intelRows = bySeries.get(item.key) ?? [];
    const baseByNumber = new Map(item.seasonDetails.map((season) => [season.seasonNumber, season]));
    const intelByNumber = new Map(intelRows.map((season) => [season.seasonNumber, season]));
    const seasonNumbers = new Set<number>([...baseByNumber.keys(), ...intelByNumber.keys()]);

    const seasonDetails = [...seasonNumbers]
      .sort((left, right) => left - right)
      .map((seasonNumber) =>
        mergeSeason(
          baseByNumber.get(seasonNumber),
          intelByNumber.get(seasonNumber),
          item.estimatedAffinity,
          seasonNumber,
        ),
      );

    return { ...item, seasonDetails };
  });
}
