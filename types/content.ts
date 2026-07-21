/**
 * Modelo de contenido normalizado para el Registro Web.
 * Independiente del SDK de Notion. Seguro para serializar hacia la UI.
 */

import type { RenderMode, WebCatalogPolicy } from '@/types/web-catalog';

/** Política pública sanitizada: sin modos de escritura internos. */
export type PublicContentPolicy = Pick<
  WebCatalogPolicy,
  'visibleWeb' | 'searchable' | 'generalAI' | 'reviewAI'
>;

export interface ContentText {
  plain: string;
  href: string | null;
}

export interface ContentLink {
  url: string;
  label: string | null;
}

export interface ContentAsset {
  kind: 'image' | 'file';
  url: string;
  caption: string | null;
}

/** Provenance sin IDs internos de proveedores. */
export interface ContentProvenance {
  source: 'web-catalog';
  fetchedAt: string;
}

export type ContentBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'to_do'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'toggle'
  | 'code'
  | 'bookmark'
  | 'image'
  | 'child_page'
  | 'unsupported';

export interface ContentBlock {
  /** Identificador local opaco (no es un ID de Notion). */
  localId: string;
  type: ContentBlockType;
  text: readonly ContentText[];
  checked: boolean | null;
  language: string | null;
  link: ContentLink | null;
  asset: ContentAsset | null;
  childPageSlug: string | null;
  childPageTitle: string | null;
  children: readonly ContentBlock[];
}

export interface ContentPage {
  stableKey: string;
  slug: string;
  title: string;
  icon: string | null;
  lastEditedAt: string | null;
  renderMode: RenderMode;
  policy: PublicContentPolicy;
  blocks: readonly ContentBlock[];
  childPages: readonly { slug: string; title: string }[];
  provenance: ContentProvenance;
}
