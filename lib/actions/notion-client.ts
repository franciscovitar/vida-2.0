/**
 * Cliente Notion inyectable para escrituras 8E (sin métodos destructivos).
 * Los tests suministran fakes; el runtime usa el SDK oficial.
 */
import { Client } from '@notionhq/client';

import type { NotionRawPage } from '@/lib/notion/adapters';

export type NotionPageResult = {
  id: string;
  properties: Record<string, unknown>;
};

export type NotionActionsClient = {
  queryDataSource(
    dataSourceId: string,
    options?: { filter?: unknown; pageSize?: number },
  ): Promise<{ ok: true; pages: NotionRawPage[] } | { ok: false; message: string }>;
  createPage(input: {
    dataSourceId: string;
    properties: Record<string, unknown>;
  }): Promise<{ ok: true; page: NotionPageResult } | { ok: false; message: string }>;
  updatePage(
    pageId: string,
    properties: Record<string, unknown>,
  ): Promise<{ ok: true; page: NotionPageResult } | { ok: false; message: string }>;
  retrievePage(
    pageId: string,
  ): Promise<{ ok: true; page: NotionPageResult } | { ok: false; message: string }>;
  appendBlockChildren(
    blockId: string,
    children: readonly Record<string, unknown>[],
  ): Promise<{ ok: true } | { ok: false; message: string }>;
};

function asPage(item: { id: string; properties?: unknown }): NotionRawPage | null {
  if (!item.properties || typeof item.properties !== 'object') return null;
  return {
    id: item.id,
    properties: item.properties as Record<string, unknown>,
  };
}

function sanitizeError(): string {
  return 'Operación Notion no disponible.';
}

export function createNotionActionsClient(token: string): NotionActionsClient {
  const client = new Client({ auth: token, notionVersion: '2025-09-03' });

  return {
    async queryDataSource(dataSourceId, options) {
      try {
        const pages: NotionRawPage[] = [];
        let cursor: string | undefined;
        do {
          const response = await client.dataSources.query({
            data_source_id: dataSourceId,
            start_cursor: cursor,
            page_size: options?.pageSize ?? 100,
            ...(options?.filter ? { filter: options.filter as never } : {}),
          });
          for (const item of response.results) {
            if (!('properties' in item) || !item.properties) continue;
            const page = asPage({ id: item.id, properties: item.properties });
            if (page) pages.push(page);
          }
          cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
        } while (cursor);
        return { ok: true, pages };
      } catch {
        return { ok: false, message: sanitizeError() };
      }
    },

    async createPage(input) {
      try {
        const response = await client.pages.create({
          parent: { type: 'data_source_id', data_source_id: input.dataSourceId },
          properties: input.properties as never,
        });
        if (!('properties' in response) || !response.properties) {
          return { ok: false, message: sanitizeError() };
        }
        return {
          ok: true,
          page: {
            id: response.id,
            properties: response.properties as Record<string, unknown>,
          },
        };
      } catch {
        return { ok: false, message: sanitizeError() };
      }
    },

    async updatePage(pageId, properties) {
      try {
        const response = await client.pages.update({
          page_id: pageId,
          properties: properties as never,
        });
        if (!('properties' in response) || !response.properties) {
          return { ok: false, message: sanitizeError() };
        }
        return {
          ok: true,
          page: {
            id: response.id,
            properties: response.properties as Record<string, unknown>,
          },
        };
      } catch {
        return { ok: false, message: sanitizeError() };
      }
    },

    async retrievePage(pageId) {
      try {
        const response = await client.pages.retrieve({ page_id: pageId });
        if (!('properties' in response) || !response.properties) {
          return { ok: false, message: sanitizeError() };
        }
        return {
          ok: true,
          page: {
            id: response.id,
            properties: response.properties as Record<string, unknown>,
          },
        };
      } catch {
        return { ok: false, message: sanitizeError() };
      }
    },

    async appendBlockChildren(blockId, children) {
      try {
        await client.blocks.children.append({
          block_id: blockId,
          children: children as never,
        });
        return { ok: true };
      } catch {
        return { ok: false, message: sanitizeError() };
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers de propiedades Notion                                              */
/* -------------------------------------------------------------------------- */

export function titleProp(text: string): Record<string, unknown> {
  return { title: [{ type: 'text', text: { content: text.slice(0, 2000) } }] };
}

export function richTextProp(text: string): Record<string, unknown> {
  return { rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }] };
}

export function selectProp(name: string): Record<string, unknown> {
  return { select: { name } };
}

export function statusProp(name: string): Record<string, unknown> {
  return { status: { name } };
}

export function checkboxProp(value: boolean): Record<string, unknown> {
  return { checkbox: value };
}

export function dateProp(isoOrDate: string | null): Record<string, unknown> {
  if (!isoOrDate) return { date: null };
  return { date: { start: isoOrDate.slice(0, 10) } };
}

export function relationProp(ids: readonly string[]): Record<string, unknown> {
  return { relation: ids.map((id) => ({ id })) };
}

export function readTitle(prop: unknown): string {
  const obj = prop && typeof prop === 'object' ? (prop as Record<string, unknown>) : null;
  if (!obj) return '';
  const title = obj.title;
  if (!Array.isArray(title)) return '';
  return title
    .map((part) => {
      const p = part && typeof part === 'object' ? (part as Record<string, unknown>) : null;
      return typeof p?.plain_text === 'string' ? p.plain_text : '';
    })
    .join('')
    .trim();
}

export function readRichText(prop: unknown): string {
  const obj = prop && typeof prop === 'object' ? (prop as Record<string, unknown>) : null;
  if (!obj) return '';
  const rich = obj.rich_text;
  if (!Array.isArray(rich)) return readTitle(prop);
  return rich
    .map((part) => {
      const p = part && typeof part === 'object' ? (part as Record<string, unknown>) : null;
      return typeof p?.plain_text === 'string' ? p.plain_text : '';
    })
    .join('')
    .trim();
}

export function readSelectName(prop: unknown): string | null {
  const obj = prop && typeof prop === 'object' ? (prop as Record<string, unknown>) : null;
  if (!obj) return null;
  const select = (obj.select ?? obj.status) as Record<string, unknown> | null;
  if (!select || typeof select !== 'object') return null;
  return typeof select.name === 'string' ? select.name : null;
}

export function readCheckbox(prop: unknown): boolean {
  const obj = prop && typeof prop === 'object' ? (prop as Record<string, unknown>) : null;
  return Boolean(obj && obj.checkbox === true);
}

export function readDateStart(prop: unknown): string | null {
  const obj = prop && typeof prop === 'object' ? (prop as Record<string, unknown>) : null;
  if (!obj) return null;
  const date = obj.date as Record<string, unknown> | null;
  if (!date || typeof date.start !== 'string') return null;
  return date.start.slice(0, 10);
}

export function readRelationIds(prop: unknown): string[] {
  const obj = prop && typeof prop === 'object' ? (prop as Record<string, unknown>) : null;
  if (!obj || !Array.isArray(obj.relation)) return [];
  const ids: string[] = [];
  for (const item of obj.relation) {
    const rel = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (rel && typeof rel.id === 'string') ids.push(rel.id);
  }
  return ids;
}
