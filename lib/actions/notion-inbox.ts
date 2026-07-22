/**
 * Puerto real de captura en Bandeja (página Notion canónica).
 */
import { createNotionActionsClient, type NotionActionsClient } from '@/lib/actions/notion-client';
import { opaqueKey } from '@/lib/actions/opaque';
import type { NotionInboxWritePort } from '@/lib/actions/ports';
import type { InboxCapturePayload } from '@/types/actions';

export type NotionInboxWriteDeps = {
  client: NotionActionsClient;
  inboxPageId: string;
};

function sanitizeOrigin(origin: string): string {
  return origin.replace(/[^\w.\-:/ ]+/g, '').slice(0, 80) || 'web';
}

function buildCaptureParagraph(payload: InboxCapturePayload): Record<string, unknown> {
  const lines = [
    payload.text.slice(0, 1800),
    `Fecha: ${payload.capturedAt.slice(0, 19)}`,
    `Origen: ${sanitizeOrigin(payload.origin)}`,
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

      const appended = await deps.client.appendBlockChildren(deps.inboxPageId, [
        buildCaptureParagraph(payload),
      ]);
      if (!appended.ok) {
        return {
          ok: false,
          code: 'failed',
          message: appended.message,
          preserveText: true,
        };
      }

      return { ok: true, key: opaqueKey('inbox', meta.idempotencyKey) };
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
