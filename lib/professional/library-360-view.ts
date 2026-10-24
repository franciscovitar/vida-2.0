import type {
  Library360MentionAudit,
  Library360Area,
  Library360CandidateReference,
  Library360Entry,
  Library360ResearchCase,
} from '@/types/library-360';
import type { Library360Snapshot } from '@/types/library-360';

export interface Library360ViewEntry {
  entry: Library360Entry;
  primaryArea: Library360Area;
  relatedAreas: readonly Library360Area[];
}

export type Library360Result =
  | { kind: 'resource'; id: string; areaCode: string; value: Library360ViewEntry }
  | { kind: 'case'; id: string; areaCode: string; value: Library360ResearchCase }
  | { kind: 'candidate'; id: string; areaCode: string; value: Library360CandidateReference }
  | { kind: 'hold'; id: string; areaCode: string; value: Library360MentionAudit };

export function selectLibrary360Entries(
  areas: readonly Library360Area[],
  areaId = 'ALL',
): Library360ViewEntry[] {
  const areasById = new Map(areas.map((area) => [area.id, area]));

  return areas.flatMap((primaryArea) =>
    primaryArea.entries
      .filter(
        (entry) =>
          areaId === 'ALL' || primaryArea.id === areaId || entry.relatedAreaIds.includes(areaId),
      )
      .map((entry) => ({
        entry,
        primaryArea,
        relatedAreas: entry.relatedAreaIds.flatMap((id) => {
          const area = areasById.get(id);
          return area ? [area] : [];
        }),
      })),
  );
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function searchLibrary360Entries(
  entries: readonly Library360ViewEntry[],
  query: string,
): Library360ViewEntry[] {
  const terms = normalized(query.trim());
  if (!terms) return [...entries];
  const queryWords = terms.split(/\s+/);

  return entries.filter(({ entry, primaryArea, relatedAreas }) => {
    const searchableText = normalized(
      [
        entry.id,
        entry.name,
        entry.kind,
        entry.status,
        entry.summary,
        entry.application,
        entry.benefit,
        entry.caution,
        entry.repository,
        entry.sourceUrl,
        entry.legacyCategoryId,
        primaryArea.label,
        ...entry.tags,
        ...entry.sourceReferences.flatMap((reference) => [reference.label, reference.url]),
        ...relatedAreas.map((area) => area.label),
      ].join(' '),
    );
    return queryWords.every((word) => searchableText.includes(word));
  });
}

export function selectLibrary360Results(
  snapshot: Library360Snapshot,
  areaId = 'ALL',
  type = 'ALL',
): Library360Result[] {
  const resources = selectLibrary360Entries(snapshot.areas, areaId).map((value) => ({
    kind: 'resource' as const,
    id: value.entry.id,
    areaCode: value.primaryArea.code,
    value,
  }));
  const cases = snapshot.researchCases
    .filter(
      (item) =>
        areaId === 'ALL' ||
        item.areaCode === snapshot.areas.find((area) => area.id === areaId)?.code,
    )
    .map((value) => ({ kind: 'case' as const, id: value.id, areaCode: value.areaCode, value }));
  const candidates = snapshot.candidateReferences
    .filter(
      (item) =>
        areaId === 'ALL' || item.area === snapshot.areas.find((area) => area.id === areaId)?.code,
    )
    .map((value) => ({ kind: 'candidate' as const, id: value.id, areaCode: value.area, value }));
  const holds = snapshot.researchMentionAudit
    .filter((item) => item.disposition === 'HOLD')
    .filter(
      (item) =>
        areaId === 'ALL' || item.area === snapshot.areas.find((area) => area.id === areaId)?.code,
    )
    .map((value) => ({ kind: 'hold' as const, id: value.id, areaCode: value.area, value }));
  const results: Library360Result[] = [...resources, ...cases, ...candidates, ...holds];
  return type === 'ALL' ? results : results.filter((item) => item.kind === type);
}

export function searchLibrary360Results(
  results: readonly Library360Result[],
  query: string,
): Library360Result[] {
  const terms = normalized(query.trim());
  if (!terms) return [...results];
  const words = terms.split(/\s+/);
  return results.filter(({ kind, value }) => {
    const searchable =
      kind === 'resource'
        ? [
            value.entry.id,
            value.entry.name,
            value.entry.kind,
            value.entry.summary,
            value.entry.application,
            value.entry.benefit,
            value.entry.caution,
            value.entry.repository,
            value.entry.tags.join(' '),
            value.primaryArea.label,
            value.relatedAreas.map((area) => area.label).join(' '),
            value.entry.researchMentionRefs?.map((ref) => ref.sourceId).join(' ') ?? '',
          ].join(' ')
        : kind === 'case'
          ? value.searchText + ' ' + value.sourceUrl + ' ' + value.areaCode
          : kind === 'candidate'
            ? value.searchText + ' ' + value.referenceUrl + ' ' + value.sourcePath
            : [
                value.id,
                value.name,
                value.identity ?? '',
                value.disposition,
                value.reason,
                value.sourcePath,
              ].join(' ');
    const textValue = normalized(searchable);
    return words.every((word) => textValue.includes(word));
  });
}
