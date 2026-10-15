import type { CapabilityItem } from '@/lib/learning/capabilities-model';

export const CAPABILITY_PAGE_SIZE = 12;
export const EMPTY_CAPABILITY_FILTERS: CapabilityFilters = {
  query: '',
  area: '',
  subcategory: '',
  content: 'all',
};

export type CapabilityFilters = {
  query: string;
  area: string;
  subcategory: string;
  content: 'all' | 'curated' | 'discovery';
};

function searchable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

export function subcategoryLabel(value: string): string {
  const words = value.replaceAll('_', ' ');
  return words.charAt(0).toLocaleUpperCase('es') + words.slice(1);
}

export function capabilitySubcategories(items: CapabilityItem[], area: string): string[] {
  return [
    ...new Set(items.filter((item) => !area || item.area === area).map((item) => item.subcategory)),
  ].sort((a, b) => subcategoryLabel(a).localeCompare(subcategoryLabel(b), 'es'));
}

export function filterCapabilities(
  items: CapabilityItem[],
  filters: CapabilityFilters,
): CapabilityItem[] {
  const terms = searchable(filters.query.trim()).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const haystack = searchable(`${item.name} ${item.area} ${subcategoryLabel(item.subcategory)}`);
    return (
      (!filters.area || item.area === filters.area) &&
      (!filters.subcategory || item.subcategory === filters.subcategory) &&
      (filters.content === 'all' || item.status === filters.content) &&
      terms.every((term) => haystack.includes(term))
    );
  });
}

export function capabilityExcerpt(item: CapabilityItem): string {
  const text =
    item.card?.whatYouGet ??
    `Del inventario de ${item.area.toLocaleLowerCase('es')}: ${subcategoryLabel(item.subcategory)}.`;
  if (text.length <= 150) return text;
  const clipped = text.slice(0, 150);
  const boundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, boundary > 100 ? boundary : 150).trimEnd()}…`;
}
