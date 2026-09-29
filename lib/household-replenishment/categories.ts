import type { ReplenishmentListEntry } from './types';

export const DEFAULT_HOUSEHOLD_CATEGORIES = [
  'Frutas y verduras',
  'Carnes y pescados',
  'Lácteos y huevos',
  'Panadería',
  'Almacén',
  'Bebidas',
  'Congelados',
  'Limpieza',
  'Higiene',
  'Mascotas',
  'Otros',
] as const;

export type DefaultHouseholdCategory = (typeof DEFAULT_HOUSEHOLD_CATEGORIES)[number];

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

export function sanitizeCategory(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return 'Otros';
  return trimmed.slice(0, 60);
}

export function normalizeCategoryOrder(
  requested: readonly string[] | null | undefined,
  observed: readonly string[] = [],
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const append = (raw: string) => {
    const value = sanitizeCategory(raw);
    const key = normalized(value);
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(value);
  };

  for (const value of requested ?? []) append(value);
  for (const value of DEFAULT_HOUSEHOLD_CATEGORIES) append(value);
  for (const value of observed) append(value);

  return ordered;
}

export function sortReplenishmentEntries(
  entries: readonly ReplenishmentListEntry[],
  categoryOrder: readonly string[],
): ReplenishmentListEntry[] {
  const rank = new Map(categoryOrder.map((category, index) => [normalized(category), index]));
  const fallbackRank = categoryOrder.length + 100;

  return [...entries].sort((a, b) => {
    const aRank = rank.get(normalized(a.category)) ?? fallbackRank;
    const bRank = rank.get(normalized(b.category)) ?? fallbackRank;
    if (aRank !== bRank) return aRank - bRank;
    const categoryCompare = a.category.localeCompare(b.category, 'es');
    if (categoryCompare !== 0) return categoryCompare;
    return a.name.localeCompare(b.name, 'es');
  });
}
