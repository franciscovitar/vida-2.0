/**
 * Modelo de contenido normalizado para el Registro Web.
 * Independiente del SDK de Notion. Seguro para serializar hacia la UI.
 */

import type { RenderMode, WebCatalogPolicy, WebCatalogSection } from '@/types/web-catalog';

/** Política pública sanitizada: sin modos de escritura internos. */
export type PublicContentPolicy = Pick<
  WebCatalogPolicy,
  'visibleWeb' | 'searchable' | 'generalAI' | 'reviewAI'
>;

export type ContentTextColor =
  | 'default'
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'gray_background'
  | 'brown_background'
  | 'orange_background'
  | 'yellow_background'
  | 'green_background'
  | 'blue_background'
  | 'purple_background'
  | 'pink_background'
  | 'red_background';

export interface ContentTextAnnotations {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  color: ContentTextColor;
}

export interface ContentText {
  plain: string;
  href: string | null;
  /** Anotaciones visuales sanitizadas provenientes de Notion. */
  annotations?: ContentTextAnnotations;
  /** Enlace Notion bloqueado por política: texto sin href. */
  unavailable?: boolean;
  /** Enlace externo HTTPS (abrir en nueva pestaña). */
  external?: boolean;
}

export interface ContentLink {
  url: string;
  label: string | null;
  external?: boolean;
  unavailable?: boolean;
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
  | 'child_database'
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
  /** Slug publicado del recurso hijo, si existe y la política permite enlazarlo. */
  childPageSlug: string | null;
  /** Título sanitizado de child_page o child_database. */
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
  /** Sección editorial sanitizada (sin IDs). */
  section: WebCatalogSection;
  policy: PublicContentPolicy;
  blocks: readonly ContentBlock[];
  childPages: readonly { slug: string; title: string }[];
  provenance: ContentProvenance;
}
