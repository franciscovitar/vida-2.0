import { executeConversationalInboxDirectApply } from '@/lib/capture/direct-inbox';
import type { ActionResultCode } from '@/types/actions';

export type OpenClawTelegramInboxDirectRequest = {
  operation: 'inbox.capture.direct';
  transport: {
    channel: 'telegram';
    principalId: string;
    sourceEventId: string;
  };
  input: {
    text: string;
    link: string | null;
  };
};

export type OpenClawTelegramInboxDirectResult = {
  ok: boolean;
  code: ActionResultCode;
  message: string;
  replay: boolean;
  verified: boolean | null;
};

type Env = Readonly<Record<string, string | undefined>>;

const SAFE_TRANSPORT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isOpenClawTelegramInboxDirectEnabled(env: Env = process.env): boolean {
  return (
    env.OPENCLAW_TELEGRAM_INBOX_DIRECT_ENABLED === 'true' &&
    env.CONVERSATIONAL_INBOX_DIRECT_APPLY_ENABLED === 'true' &&
    env.WRITE_ACTIONS_ENABLED === 'true'
  );
}

export function parseOpenClawTelegramInboxDirectRequest(
  raw: unknown,
): { ok: true; value: OpenClawTelegramInboxDirectRequest } | { ok: false; message: string } {
  if (!isPlainObject(raw) || !hasOnlyKeys(raw, ['operation', 'transport', 'input'])) {
    return { ok: false, message: 'Envelope de captura inválido.' };
  }
  if (raw.operation !== 'inbox.capture.direct') {
    return { ok: false, message: 'Operación directa no permitida.' };
  }
  if (
    !isPlainObject(raw.transport) ||
    !hasOnlyKeys(raw.transport, ['channel', 'principalId', 'sourceEventId'])
  ) {
    return { ok: false, message: 'Transporte inválido.' };
  }
  if (
    raw.transport.channel !== 'telegram' ||
    typeof raw.transport.principalId !== 'string' ||
    !raw.transport.principalId.startsWith('telegram:') ||
    !SAFE_TRANSPORT_ID.test(raw.transport.principalId) ||
    typeof raw.transport.sourceEventId !== 'string' ||
    !raw.transport.sourceEventId.startsWith('telegram:') ||
    !SAFE_TRANSPORT_ID.test(raw.transport.sourceEventId)
  ) {
    return { ok: false, message: 'Identidad de transporte inválida.' };
  }
  if (!isPlainObject(raw.input) || !hasOnlyKeys(raw.input, ['text', 'link'])) {
    return { ok: false, message: 'Entrada de captura inválida.' };
  }
  if (
    typeof raw.input.text !== 'string' ||
    raw.input.text.trim().length < 1 ||
    raw.input.text.length > 2000 ||
    (raw.input.link !== null && typeof raw.input.link !== 'string')
  ) {
    return { ok: false, message: 'Entrada de captura inválida.' };
  }

  return {
    ok: true,
    value: {
      operation: 'inbox.capture.direct',
      transport: {
        channel: 'telegram',
        principalId: raw.transport.principalId,
        sourceEventId: raw.transport.sourceEventId,
      },
      input: {
        text: raw.input.text,
        link: raw.input.link,
      },
    },
  };
}

export async function executeOpenClawTelegramInboxDirect(
  request: OpenClawTelegramInboxDirectRequest,
  options: { env?: Env } = {},
): Promise<OpenClawTelegramInboxDirectResult> {
  const env = options.env ?? process.env;
  if (!isOpenClawTelegramInboxDirectEnabled(env)) {
    return {
      ok: false,
      code: 'flag-disabled',
      message: 'Captura directa Telegram desactivada.',
      replay: false,
      verified: null,
    };
  }

  return executeConversationalInboxDirectApply(
    {
      channel: 'telegram',
      principalId: request.transport.principalId,
      sourceEventId: request.transport.sourceEventId,
      userIntent: 'explicit-write',
      text: request.input.text,
      link: request.input.link,
    },
    { env },
  );
}
