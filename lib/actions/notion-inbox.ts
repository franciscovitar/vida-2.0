/**
 * Puerto real de captura en Bandeja (página Notion canónica).
 * Mapping durable (Upstash/memory) para blockId + ownership multi-instance.
 */
import { createHash } from 'node:crypto';
import { createNotionActionsClient, type NotionActionsClient } from '@/lib/actions/notion-client';
import {
  createMemoryInboxCaptureMappingStore,
  type InboxCaptureMappingStore,
} from '@/lib/actions/inbox-mapping';
import { opaqueKey } from '@/lib/actions/opaque';
import type { NotionInboxWritePort, OwnershipProof } from '@/lib/actions/ports';
import type { InboxCapturePayload } from '@/types/actions';

export type NotionInboxWriteDeps = {
  client: NotionActionsClient;
  inboxPageId: string;
  mappingStore?: InboxCaptureMappingStore;
  /** TTL for mapping entries (rollback window). */
  mappingTtlSeconds?: number;
};

function sanitizeOrigin(origin: string): string {
  return origin.replace(/[^\w.\-:/ ]+/g, '').slice(0, 80) || 'web';
}

function ownershipForCapture(key: string, idempotencyKey: string): OwnershipProof {
  return createHash('sha256')
    .update(`notion-inbox-own:${key}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 24);
}

function buildCaptureParagraph(
  payload: InboxCapturePayload,
  ownership: OwnershipProof,
): Record<string, unknown> {
  const lines = [
    payload.text.slice(0, 1800),
    `Fecha: ${payload.capturedAt.slice(0, 19)}`,
    `Origen: ${sanitizeOrigin(payload.origin)}`,
    `Own: ${ownership}`,
  ];
  if (payload.link) {
    lines.push(`Enlace: ${payload.link}`);
  }
  const content = lines.join('\n').slice(0, 2000);
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content } }],
    },
  };
}

export function createNotionInboxWritePort(deps: NotionInboxWriteDeps): NotionInboxWritePort {
  const mappingStore = deps.mappingStore ?? createMemoryInboxCaptureMappingStore();
  const mappingTtlSeconds = deps.mappingTtlSeconds ?? 604_800;

  return {
    async appendCapture(payload, meta) {
      const page = await deps.client.retrievePage(deps.inboxPageId);
      if (!page.ok) {
        return {
          ok: false,
          code: 'not-configured',
          message: 'Bandeja no accesible o no configurada.',
          preserveText: true,
        };
      }

      const key = opaqueKey('inbox', meta.idempotencyKey);
      const ownership = ownershipForCapture(key, meta.idempotencyKey);
      const appended = await deps.client.appendBlockChildren(deps.inboxPageId, [
        buildCaptureParagraph(payload, ownership),
      ]);
      if (!appended.ok) {
        return {
          ok: false,
          code: 'failed',
          message: appended.message,
          preserveText: true,
        };
      }
      const blockId = appended.blockIds?.[0];
      if (!blockId) {
        return {
          ok: false,
          code: 'verification-failed',
          message: 'Notion no devolvió block id.',
          preserveText: true,
        };
      }

      await mappingStore.put(key, { blockId, ownership }, Math.max(1, mappingTtlSeconds));
      return { ok: true, key, ownership };
    },

    async archiveCapture(key, ownership) {
      const mapping = await mappingStore.get(key);
      if (!mapping || mapping.ownership !== ownership) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      const block = await deps.client.retrieveBlock(mapping.blockId);
      if (!block.ok) {
        return { ok: false, code: 'not-found', message: 'Bloque de captura no encontrado.' };
      }
      if (!block.block.plainText.includes(`Own: ${ownership}`)) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership en bloque inválido.' };
      }
      if (block.block.archived) {
        await mappingStore.delete(key);
        return { ok: true };
      }
      const archived = await deps.client.archiveBlock(mapping.blockId);
      if (!archived.ok) {
        return { ok: false, code: 'failed', message: archived.message };
      }
      await mappingStore.delete(key);
      return { ok: true };
    },

    async verifyCapture(key) {
      const mapping = await mappingStore.get(key);
      if (!mapping) return { ok: true, present: false };
      const block = await deps.client.retrieveBlock(mapping.blockId);
      if (!block.ok) return { ok: true, present: false };
      return { ok: true, present: !block.block.archived };
    },
  };
}

export function createNotionInboxWritePortFromToken(input: {
  token: string;
  inboxPageId: string;
  mappingStore?: InboxCaptureMappingStore;
  mappingTtlSeconds?: number;
}): NotionInboxWritePort {
  return createNotionInboxWritePort({
    client: createNotionActionsClient(input.token),
    inboxPageId: input.inboxPageId,
    mappingStore: input.mappingStore,
    mappingTtlSeconds: input.mappingTtlSeconds,
  });
}
