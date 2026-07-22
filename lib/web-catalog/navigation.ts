/**
 * Navegación dinámica documental desde el Registro Web (pura / testeable).
 */
import {
  primaryNav as staticPrimaryNav,
  secondaryNav as staticSecondaryNav,
  type NavItemData,
} from '@/lib/constants/navigation';
import { canNavigateWebCatalogEntry } from '@/lib/web-catalog/policy';
import { WEB_CATALOG_FIXED_ROUTES } from '@/lib/web-catalog/section-labels';
import type { Domain } from '@/types';
import type { WebCatalogEntry, WebCatalogSection } from '@/types/web-catalog';

const SECTION_ORDER: readonly WebCatalogSection[] = [
  'today',
  'operations',
  'areas',
  'personal-systems',
  'reference',
  'archive',
  'system',
  'private',
];

const FIXED_STABLE_KEYS: ReadonlySet<string> = new Set(
  Object.values(WEB_CATALOG_FIXED_ROUTES).map((route) => route.stableKey),
);

function sectionRank(section: WebCatalogSection): number {
  const index = SECTION_ORDER.indexOf(section);
  return index === -1 ? SECTION_ORDER.length : index;
}

function placementRank(placement: WebCatalogEntry['navigationPlacement']): number {
  if (placement === 'primary') return 0;
  if (placement === 'secondary') return 1;
  if (placement === 'contextual') return 2;
  return 3;
}

function domainForSection(section: WebCatalogSection): Domain {
  if (section === 'today') return 'neutral';
  if (section === 'operations') return 'productivity';
  if (section === 'areas') return 'projects';
  if (section === 'personal-systems') return 'habits';
  if (section === 'reference') return 'learning';
  return 'neutral';
}

/** Entradas documentales ordenadas para el menú. */
export function listNavigableCatalogEntries(
  entries: readonly WebCatalogEntry[],
): WebCatalogEntry[] {
  return entries
    .filter((entry) => canNavigateWebCatalogEntry(entry))
    .filter((entry) => !FIXED_STABLE_KEYS.has(entry.stableKey))
    .slice()
    .sort((a, b) => {
      const sectionDiff = sectionRank(a.section) - sectionRank(b.section);
      if (sectionDiff !== 0) return sectionDiff;
      const placementDiff =
        placementRank(a.navigationPlacement) - placementRank(b.navigationPlacement);
      if (placementDiff !== 0) return placementDiff;
      const orderA = a.navigationOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.navigationOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.editorialName.localeCompare(b.editorialName, 'es');
    });
}

export function catalogEntryToNavItem(entry: WebCatalogEntry): NavItemData {
  return {
    label: entry.editorialName,
    href: `/p/${entry.slug}`,
    icon: 'document',
    domain: domainForSection(entry.section),
  };
}

/**
 * Construye primary/secondary finales.
 * Con flag apagada: menú estático intacto.
 * Con flag activa: estático + Buscar + documentales del catálogo.
 */
export function buildAppNavigation(
  enabled: boolean,
  entries: readonly WebCatalogEntry[],
): { primary: NavItemData[]; secondary: NavItemData[] } {
  if (!enabled) {
    return {
      primary: [...staticPrimaryNav],
      secondary: [...staticSecondaryNav],
    };
  }

  const navigable = listNavigableCatalogEntries(entries);
  const catalogPrimary = navigable
    .filter((entry) => entry.navigationPlacement === 'primary')
    .map(catalogEntryToNavItem);
  const catalogSecondary = navigable
    .filter(
      (entry) =>
        entry.navigationPlacement === 'secondary' || entry.navigationPlacement === 'contextual',
    )
    .map(catalogEntryToNavItem);

  const primaryWithSearch: NavItemData[] = [
    ...staticPrimaryNav,
    { label: 'Buscar', href: '/buscar', icon: 'buscar', domain: 'neutral' },
    ...catalogPrimary,
  ];

  return {
    primary: primaryWithSearch,
    secondary: [...staticSecondaryNav, ...catalogSecondary],
  };
}
