/**
 * Navegación dinámica documental desde el Registro Web (pura / testeable).
 */
import {
  primaryNav as staticPrimaryNav,
  secondaryNav as staticSecondaryNav,
  type NavItemData,
} from '@/lib/constants/navigation';
import { canNavigateWebCatalogEntry, isPrivateWebCatalogEntry } from '@/lib/web-catalog/policy';
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

const FIXED_PATH_BY_STABLE_KEY: ReadonlyMap<string, string> = new Map(
  Object.values(WEB_CATALOG_FIXED_ROUTES).map((route) => [route.stableKey, route.path]),
);

const DOCUMENTARY_SHADOW_SUFFIXES = new Set(['guia', 'documento', 'manual', 'mapa']);

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

function normalizeNavText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function staticRouteSegment(item: NavItemData): string | null {
  const match = /^\/([^/]+)$/.exec(item.href);
  return match?.[1] ?? null;
}

/** Evita dos destinos de menú para el mismo dominio funcional/documental. */
function isShadowedByStaticModule(entry: WebCatalogEntry, staticItems: readonly NavItemData[]) {
  const normalizedEntryLabel = normalizeNavText(entry.editorialName);

  return staticItems.some((item) => {
    const normalizedStaticLabel = normalizeNavText(item.label);
    if (normalizedEntryLabel === normalizedStaticLabel) return true;

    const segment = staticRouteSegment(item);
    if (!segment) return false;
    if (entry.slug === segment) return true;

    const suffix = entry.slug.startsWith(`${segment}-`)
      ? entry.slug.slice(segment.length + 1)
      : null;
    return suffix !== null && DOCUMENTARY_SHADOW_SUFFIXES.has(suffix);
  });
}

function dedupeNavItems(items: readonly NavItemData[]): NavItemData[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

function fixedRouteIsNavigable(
  path: string,
  entriesByStableKey: ReadonlyMap<string, WebCatalogEntry>,
): boolean {
  const fixed = Object.values(WEB_CATALOG_FIXED_ROUTES).find((route) => route.path === path);
  if (!fixed) return true;
  const entry = entriesByStableKey.get(fixed.stableKey);
  return entry ? canNavigateWebCatalogEntry(entry) : false;
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
  const fixedPath = FIXED_PATH_BY_STABLE_KEY.get(entry.stableKey);
  return {
    label: entry.editorialName,
    href: fixedPath ?? `/p/${entry.slug}`,
    icon: 'document',
    domain: domainForSection(entry.section),
  };
}

/**
 * Construye primary/secondary finales.
 * Con flag apagada: menú estático intacto.
 * Con flag activa: las rutas documentales obedecen catálogo y privacidad.
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

  const entriesByStableKey = new Map(entries.map((entry) => [entry.stableKey, entry]));

  const safeStaticPrimary = staticPrimaryNav.filter((item) =>
    fixedRouteIsNavigable(item.href, entriesByStableKey),
  );
  const safeStaticSecondary = staticSecondaryNav.filter((item) => {
    // Journaling no pertenece a la navegación general: requiere una experiencia privada dedicada.
    if (item.href === '/journaling') return false;
    return fixedRouteIsNavigable(item.href, entriesByStableKey);
  });

  const navigable = listNavigableCatalogEntries(entries).filter(
    (entry) =>
      !isPrivateWebCatalogEntry(entry) &&
      !isShadowedByStaticModule(entry, [...safeStaticPrimary, ...safeStaticSecondary]),
  );
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
    ...safeStaticPrimary,
    { label: 'Buscar', href: '/buscar', icon: 'buscar', domain: 'neutral' },
    ...catalogPrimary,
  ];

  return {
    primary: dedupeNavItems(primaryWithSearch),
    secondary: dedupeNavItems([...safeStaticSecondary, ...catalogSecondary]),
  };
}
