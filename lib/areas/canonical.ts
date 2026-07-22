/**
 * Catálogo canónico de Áreas (identidad por slug/clave estable, no por título solo).
 */
import { areaDomain } from '@/lib/notion/adapters';
import type { AreaSlug } from '@/types/areas';
import type { Domain } from '@/types';
import type { NotionArea } from '@/types/notion';

export type CanonicalAreaDef = {
  slug: AreaSlug;
  stableKey: string;
  /** Nombres canónicos esperados en Notion (match exacto o keywords). */
  matchNames: readonly string[];
  keywords: readonly string[];
  domain: Domain;
};

export const CANONICAL_AREAS: readonly CanonicalAreaDef[] = [
  {
    slug: 'facultad',
    stableKey: 'area.facultad',
    matchNames: ['Facultad'],
    keywords: ['facultad'],
    domain: 'learning',
  },
  {
    slug: 'genova-trabajo',
    stableKey: 'area.genova-trabajo',
    matchNames: ['Genova / Trabajo', 'Génova / Trabajo', 'Genova', 'Trabajo'],
    keywords: ['genova', 'génova', 'trabajo'],
    domain: 'productivity',
  },
  {
    slug: 'salud',
    stableKey: 'area.salud',
    matchNames: ['Salud'],
    keywords: ['salud'],
    domain: 'health',
  },
  {
    slug: 'vida-personal',
    stableKey: 'area.vida-personal',
    matchNames: ['Vida personal', 'Personal'],
    keywords: ['vida personal', 'personal', 'vida'],
    domain: 'neutral',
  },
] as const;

export function isAreaSlug(value: string): value is AreaSlug {
  return CANONICAL_AREAS.some((area) => area.slug === value);
}

export function getCanonicalAreaDef(slug: string): CanonicalAreaDef | null {
  return CANONICAL_AREAS.find((area) => area.slug === slug) ?? null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Resuelve un Área Notion hacia el slug canónico, o null si no es canónica. */
export function resolveCanonicalSlugFromArea(area: Pick<NotionArea, 'name'>): AreaSlug | null {
  const n = normalizeName(area.name);
  for (const def of CANONICAL_AREAS) {
    if (def.matchNames.some((name) => normalizeName(name) === n)) return def.slug;
  }
  for (const def of CANONICAL_AREAS) {
    if (def.keywords.some((keyword) => n.includes(keyword))) return def.slug;
  }
  // Fallback por dominio derivado del nombre (sin inventar slugs nuevos).
  const domain = areaDomain(area.name);
  if (domain === 'learning') return 'facultad';
  if (domain === 'productivity') return 'genova-trabajo';
  if (domain === 'health') return 'salud';
  if (domain === 'neutral' && (n.includes('personal') || n.includes('vida'))) {
    return 'vida-personal';
  }
  return null;
}

export function calendarKeywordsForSlug(slug: AreaSlug): readonly string[] {
  const def = getCanonicalAreaDef(slug);
  return def?.keywords ?? [];
}
