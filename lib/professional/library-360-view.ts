import type { Library360Area, Library360Entry } from '@/types/library-360';

export interface Library360ViewEntry {
  entry: Library360Entry;
  primaryArea: Library360Area;
  relatedAreas: readonly Library360Area[];
}

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
