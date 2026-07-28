/**
 * Puerto real de captura en Bandeja (página Notion canónica).
 */
import { createHash } from 'node:crypto';
import { createNotionActionsClient, type NotionActionsClient } from '@/lib/actions/notion-client';
import { opaqueKey } from '@/lib/actions/opaque';
import type { NotionInboxWritePort, OwnershipProof } from '@/lib/actions/ports';
import type { InboxCapturePayload } from '@/types/actions';

export type NotionInboxWriteDeps = {
  client: NotionActionsClient;
  inboxPageId: string;
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
  const ownershipByKey = new Map<string, OwnershipProof>();

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

      ownershipByKey.set(key, ownership);
      return { ok: true, key, ownership };
    },

    async archiveCapture(key, ownership) {
      const expected = ownershipByKey.get(key);
      if (!expected || expected !== ownership) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      // Compensación: no borra bloques (barrera); marca ownership como archivado en proceso.
      ownershipByKey.delete(key);
      return { ok: true };
    },

    async verifyCapture(key) {
      return { ok: true, present: ownershipByKey.has(key) };
    },
  };
}

export function createNotionInboxWritePortFromToken(input: {
  token: string;
  inboxPageId: string;
}): NotionInboxWritePort {
  return createNotionInboxWritePort({
    client: createNotionActionsClient(input.token),
    inboxPageId: input.inboxPageId,
  });
}
