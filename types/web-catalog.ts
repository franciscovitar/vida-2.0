/**
 * Contrato editorial del futuro Registro Web de Vida 2.0.
 *
 * 8B.1 solo define datos planos y serializables. No conecta Notion, rutas ni UI.
 */

export type WebCatalogStatus = 'draft' | 'published' | 'hidden' | 'legacy' | 'excluded';

export type WebCatalogSection =
  | 'today'
  | 'operations'
  | 'areas'
  | 'personal-systems'
  | 'reference'
  | 'system'
  | 'private'
  | 'archive';

export type RenderMode =
  | 'document'
  | 'area'
  | 'faculty'
  | 'health'
  | 'gym'
  | 'operational-database'
  | 'functional-module'
  | 'system'
  | 'private';

export type PrivacyLevel = 'general' | 'sensitive' | 'private' | 'system' | 'excluded';

export type AIUsage = 'allowed' | 'limited' | 'explicit-authorization' | 'denied';

export type WriteMode = 'none' | 'proposal' | 'properties' | 'content' | 'special-module';

export type ConfirmationMode = 'none' | 'explicit' | 'reinforced';

export type NavigationPlacement = 'primary' | 'secondary' | 'contextual' | 'none';

export interface WebCatalogPolicy {
  visibleWeb: boolean;
  searchable: boolean;
  generalAI: AIUsage;
  reviewAI: AIUsage;
  writeMode: WriteMode;
  confirmation: ConfirmationMode;
}

export interface WebCatalogEntry {
  stableKey: string;
  editorialName: string;
  /** Referencia opaca de servidor. Nunca debe enviarse al cliente. */
  sourceRef: string;
  status: WebCatalogStatus;
  canonical: boolean;
  /** Clave estable del recurso legacy que esta entrada reemplaza. */
  replacesResourceKey: string | null;
  section: WebCatalogSection;
  slug: string;
  aliases: readonly string[];
  navigationPlacement: NavigationPlacement;
  navigationOrder: number | null;
  renderMode: RenderMode;
  privacy: PrivacyLevel;
  policy: WebCatalogPolicy;
}

export type WebCatalogValidationCode =
  | 'duplicate-stable-key'
  | 'duplicate-slug'
  | 'duplicate-alias'
  | 'slug-alias-collision'
  | 'invalid-slug'
  | 'invalid-alias'
  | 'invalid-navigation-order'
  | 'status-canonical-conflict'
  | 'legacy-canonical'
  | 'legacy-unsafe'
  | 'unknown-renderer'
  | 'incompatible-policy'
  | 'insufficient-confirmation'
  | 'private-unsafe'
  | 'system-unsafe'
  | 'excluded-unsafe';

export interface WebCatalogValidationIssue {
  code: WebCatalogValidationCode;
  severity: 'error';
  message: string;
  entryKey: string;
  field?: keyof WebCatalogEntry | `policy.${keyof WebCatalogPolicy}`;
  conflictingEntryKey?: string;
}

export interface WebCatalogValidationResult {
  valid: boolean;
  issues: readonly WebCatalogValidationIssue[];
}

export type WebCatalogMatchKind = 'slug' | 'alias';

export interface WebCatalogResolution {
  stableKey: string;
  matchedBy: WebCatalogMatchKind;
  matchedValue: string;
}

export interface WebCatalogRouteIndex {
  routes: Readonly<Record<string, WebCatalogResolution>>;
}

export type WebCatalogIndexResult =
  { ok: true; index: WebCatalogRouteIndex } | { ok: false; validation: WebCatalogValidationResult };
