/**
 * OpenClaw SDK wiring for the Vida 2.0 plugin.
 *
 * This is the only file in the plugin that imports `openclaw/plugin-sdk/*`
 * and `typebox`. Request-building, HMAC signing, routing, and fail-closed
 * logic live in the pure core (`../dispatcher.ts` and friends).
 *
 * Trusted identity comes from OpenClaw runtime context, never model params.
 * For the Telegram inbox-direct canary, message_received records only
 * runId/senderId/messageId in ephemeral process memory. before_tool_call
 * correlates the exact run and injects a one-time token. The tool consumes
 * that token locally, requires senderIsOwner=true, verifies the trusted
 * requester sender, and only then constructs the signed transport envelope.
 * The token itself never leaves OpenClaw and the model can never choose a
 * principalId or sourceEventId.
 */
import { Type, type Static, type TSchema } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';
import {
  failedTextResult,
  payloadTextResult,
  type AnyAgentTool,
} from 'openclaw/plugin-sdk/agent-runtime';
import { isSecretRef, type OpenClawPluginApi } from 'openclaw/plugin-sdk/core';
import { resolveSecretRefValues, type SecretRef } from 'openclaw/plugin-sdk/secret-ref-runtime';

import { hasAnyDataCapability, isVidaAgentId, listAllowedOperationsForAgent } from '../agents.js';
import { executeVidaOperation, type VidaOperationResult } from '../dispatcher.js';
import { createDefaultRequestIdGenerator } from '../request-id.js';
import { createTelegramDirectContextStore } from '../telegram-direct-context.js';
import { VIDA_AGENT_IDS, type VidaOperationCall } from '../types.js';

const telegramDirectContext = createTelegramDirectContextStore();

/** Closed OpenClaw SecretRef shape; arbitrary objects are rejected. */
const SecretRefSchema = Type.Object(
  {
    source: Type.Union([Type.Literal('env'), Type.Literal('file'), Type.Literal('exec')]),
    provider: Type.String({ minLength: 1 }),
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

function secretInputSchema(description?: string) {
  return Type.Union([Type.String({ minLength: 1 }), SecretRefSchema], { description });
}

/* -------------------------------------------------------------------------- */
/* Tool call parameter schema: one discriminated variant per closed operation */
/* -------------------------------------------------------------------------- */

const EmptyInputSchema = Type.Object({}, { additionalProperties: false });

const AreaSlugLiteral = Type.Union([
  Type.Literal('facultad'),
  Type.Literal('genova-trabajo'),
  Type.Literal('salud'),
  Type.Literal('vida-personal'),
]);

const AreasGetInputSchema = Type.Union([
  Type.Object({ slug: AreaSlugLiteral }, { additionalProperties: false }),
  Type.Object(
    {
      areaKey: Type.Union([
        Type.Literal('area.facultad'),
        Type.Literal('area.genova-trabajo'),
        Type.Literal('area.salud'),
        Type.Literal('area.vida-personal'),
      ]),
    },
    { additionalProperties: false },
  ),
]);

const TaskStatusLiteral = Type.Union([
  Type.Literal('Pendiente'),
  Type.Literal('En progreso'),
  Type.Literal('Bloqueada'),
  Type.Literal('Hecha'),
  Type.Literal('Algún día'),
]);

const TasksListInputSchema = Type.Object(
  {
    status: Type.Optional(TaskStatusLiteral),
    areaKey: Type.Optional(Type.String()),
    projectKey: Type.Optional(Type.String()),
    dueBefore: Type.Optional(Type.String({ description: 'ISO-8601 date.' })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    cursor: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const ProjectStatusLiteral = Type.Union([
  Type.Literal('Activo'),
  Type.Literal('En espera'),
  Type.Literal('Bloqueado'),
  Type.Literal('Completado'),
  Type.Literal('Cancelado'),
]);

const ProjectsListInputSchema = Type.Object(
  {
    status: Type.Optional(ProjectStatusLiteral),
    areaKey: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    cursor: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const CalendarUpcomingInputSchema = Type.Object(
  {
    days: Type.Optional(Type.Number({ minimum: 1, maximum: 31, description: 'Up to 31 days.' })),
  },
  { additionalProperties: false },
);

const ProposalStatusLiteral = Type.Union([
  Type.Literal('pending'),
  Type.Literal('approved'),
  Type.Literal('rejected'),
  Type.Literal('applied'),
  Type.Literal('failed'),
  Type.Literal('expired'),
]);

const ApprovalsListInputSchema = Type.Object(
  {
    status: Type.Optional(ProposalStatusLiteral),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
  },
  { additionalProperties: false },
);

const DocumentsSearchInputSchema = Type.Object(
  { query: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

const DocumentGetInputSchema = Type.Object(
  { slug: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

function readCall<TOp extends string, TInput extends TSchema>(operation: TOp, input: TInput) {
  return Type.Object(
    { operation: Type.Literal(operation), input },
    { additionalProperties: false },
  );
}

const ReadCallSchemas = [
  readCall('system.overview', EmptyInputSchema),
  readCall('areas.list', EmptyInputSchema),
  readCall('areas.get', AreasGetInputSchema),
  readCall('tasks.list', TasksListInputSchema),
  readCall('projects.list', ProjectsListInputSchema),
  readCall('calendar.upcoming', CalendarUpcomingInputSchema),
  readCall('gym.summary', EmptyInputSchema),
  readCall('approvals.list', ApprovalsListInputSchema),
  readCall('documents.search', DocumentsSearchInputSchema),
  readCall('document.get', DocumentGetInputSchema),
  readCall('technical.status', EmptyInputSchema),
  readCall('technical.logs', EmptyInputSchema),
] as const;

const ProposeOperationLiteral = Type.Union([
  Type.Literal('task.create.propose'),
  Type.Literal('task.change-status.propose'),
  Type.Literal('inbox.capture.propose'),
  Type.Literal('gym.session.create.propose'),
  Type.Literal('calendar.hold.create.propose'),
]);

const ProposeCallSchema = Type.Object(
  {
    operation: ProposeOperationLiteral,
    idempotencyKey: Type.String({ minLength: 1 }),
    reason: Type.String({ minLength: 1 }),
    expectedChange: Type.String({ minLength: 1 }),
    risk: Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')]),
    reversible: Type.Boolean(),
    targetKey: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    payload: Type.Unknown(),
  },
  { additionalProperties: false },
);

const DirectInboxCallSchema = Type.Object(
  {
    operation: Type.Literal('inbox.capture.direct'),
    input: Type.Object(
      {
        text: Type.String({ minLength: 1, maxLength: 2000 }),
        link: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      },
      { additionalProperties: false },
    ),
    transportContextToken: Type.Optional(
      Type.String({
        minLength: 32,
        maxLength: 128,
        description:
          'Internal one-time transport token. The Telegram hook overwrites this value; the model must not invent or reuse it.',
      }),
    ),
  },
  { additionalProperties: false },
);

const HealthCallSchema = Type.Object(
  { operation: Type.Literal('system.health') },
  { additionalProperties: false },
);

/** Exported for `plugin.integration.test.ts` only -- runtime behavior is unaffected by this export. */
export const VidaOperationParamsSchema = Type.Union([
  ...ReadCallSchemas,
  ProposeCallSchema,
  DirectInboxCallSchema,
  HealthCallSchema,
]);

/* -------------------------------------------------------------------------- */
/* Plugin config schema and the raw/resolved boundary                         */
/* -------------------------------------------------------------------------- */

const AgentCredentialSchema = Type.Object(
  {
    keyId: secretInputSchema(),
    secret: secretInputSchema(),
  },
  { additionalProperties: false },
);

/** Exported for `plugin.integration.test.ts` only -- runtime behavior is unaffected by this export. */
export const ConfigSchema = Type.Object(
  {
    baseUrl: Type.String({
      minLength: 1,
      description: 'Vida origin only, e.g. https://vida.example.com. No path, no query string.',
    }),
    vercelProtectionBypass: Type.Optional(
      secretInputSchema(
        'Optional fixed Vercel Deployment Protection bypass value for a protected Preview host. Sent only as the exact header x-vercel-protection-bypass; never signed, never part of the body or a query string, never a substitute for Vida HMAC.',
      ),
    ),
    agents: Type.Partial(
      Type.Object(
        {
          steward: AgentCredentialSchema,
          'health-reflection': AgentCredentialSchema,
          'digital-order': AgentCredentialSchema,
          'technical-guardian': AgentCredentialSchema,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

type RawPluginConfig = Static<typeof ConfigSchema>;
type RawSecretInput = string | SecretRef;
type RawAgentCredential = { keyId: RawSecretInput; secret: RawSecretInput };

type ResolvedAgentCredential = { keyId: string; secret: string };

type DirectInboxToolCall = {
  operation: 'inbox.capture.direct';
  input: { text: string; link?: string | null };
  transportContextToken?: string;
};

async function resolveSecretInputValue(
  value: RawSecretInput | undefined,
  api: OpenClawPluginApi,
): Promise<string | null> {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    return value.length > 0 ? value : null;
  }
  if (!isSecretRef(value)) return null;
  try {
    const resolved = await resolveSecretRefValues([value], {
      config: api.config,
      env: process.env,
    });
    const resolvedValue = resolved.values().next().value;
    return typeof resolvedValue === 'string' && resolvedValue.length > 0 ? resolvedValue : null;
  } catch {
    return null;
  }
}

async function resolveAgentCredential(
  raw: RawAgentCredential | undefined,
  api: OpenClawPluginApi,
): Promise<ResolvedAgentCredential | null> {
  if (!raw) return null;
  const [keyId, secret] = await Promise.all([
    resolveSecretInputValue(raw.keyId, api),
    resolveSecretInputValue(raw.secret, api),
  ]);
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

function toToolResult(result: VidaOperationResult): ReturnType<typeof payloadTextResult> {
  if (result.ok) {
    return payloadTextResult({
      requestId: result.requestId,
      status: result.status,
      data: result.data,
    });
  }
  return failedTextResult(result.message, { status: 'failed' as const, code: result.code });
}

function localDenied(message: string): ReturnType<typeof payloadTextResult> {
  return toToolResult({
    ok: false,
    status: null,
    code: 'invalid-input',
    message,
  });
}

function buildVidaOperationTool(
  agentId: (typeof VIDA_AGENT_IDS)[number],
  config: RawPluginConfig,
  api: OpenClawPluginApi,
  trustedRequester: { senderId?: string; senderIsOwner?: boolean },
): AnyAgentTool {
  return {
    name: 'vida_operation',
    label: 'Vida Operation',
    description:
      'Call one closed Vida 2.0 operation as the current trusted Vida agent identity. Reads and pending proposals remain available; inbox.capture.direct is a Telegram-owner-only canary whose transport identity is injected by OpenClaw hooks. No arbitrary URL, path, method, header, credential, principal, or source event id can be supplied.',
    parameters: VidaOperationParamsSchema,
    async execute(_toolCallId, params) {
      const rawCall = params as VidaOperationCall | DirectInboxToolCall;
      let call: VidaOperationCall;

      if (rawCall.operation === 'inbox.capture.direct') {
        const direct = rawCall as DirectInboxToolCall;
        if (
          agentId !== 'steward' ||
          trustedRequester.senderIsOwner !== true ||
          !trustedRequester.senderId ||
          !direct.transportContextToken
        ) {
          return localDenied('Trusted Telegram owner context is unavailable.');
        }
        const trusted = telegramDirectContext.consume(direct.transportContextToken);
        if (!trusted || trusted.senderId !== trustedRequester.senderId) {
          return localDenied('Trusted Telegram transport token is invalid or expired.');
        }
        call = {
          operation: 'inbox.capture.direct',
          transport: {
            channel: 'telegram',
            principalId: `telegram:${trusted.senderId}`,
            sourceEventId: `telegram:${trusted.messageId}`,
          },
          input: {
            text: direct.input.text,
            link: direct.input.link ?? null,
          },
        };
      } else {
        call = rawCall as VidaOperationCall;
      }

      let vercelProtectionBypass: string | undefined;
      if (config.vercelProtectionBypass !== undefined) {
        const resolvedBypass = await resolveSecretInputValue(config.vercelProtectionBypass, api);
        if (resolvedBypass === null) {
          return toToolResult({
            ok: false,
            status: null,
            code: 'invalid-configuration',
            message: 'Vercel protection bypass is configured but could not be resolved.',
          });
        }
        vercelProtectionBypass = resolvedBypass;
      }

      const result = await executeVidaOperation({
        agentId,
        call,
        config: { baseUrl: config.baseUrl, vercelProtectionBypass },
        deps: {
          fetch,
          now: () => Date.now(),
          requestId: createDefaultRequestIdGenerator(),
          resolveSecret: () => resolveAgentCredential(config.agents?.[agentId], api),
        },
      });
      return toToolResult(result);
    },
  };
}

const vidaPlugin = defineToolPlugin({
  id: 'vida-2-0-api',
  name: 'Vida 2.0 API',
  description:
    'Closed, typed bridge from one isolated local Vida agent to the private Vida 2.0 OpenClaw API (HMAC v2, sanitized reads, pending proposals, and a gated Telegram inbox-direct canary; no Journaling).',
  activation: {
    onStartup: false,
    onChannels: ['telegram'],
    onCapabilities: ['tool'],
  },
  configSchema: ConfigSchema,
  tools: (tool) => [
    tool({
      name: 'vida_operation',
      label: 'Vida Operation',
      description:
        'Call one closed Vida 2.0 operation as the current trusted Vida agent identity. Use inbox.capture.direct only when the Telegram user explicitly asks to save/capture something; ordinary conversation must not create durable data.',
      parameters: VidaOperationParamsSchema,
      optional: true,
      factory({ api, config, toolContext }) {
        const agentId = toolContext.agentId;
        if (!agentId || !isVidaAgentId(agentId)) return null;
        if (!hasAnyDataCapability(agentId) && listAllowedOperationsForAgent(agentId).length <= 1) {
          return null;
        }
        return buildVidaOperationTool(agentId, config, api, {
          senderId: toolContext.requesterSenderId,
          senderIsOwner: toolContext.senderIsOwner,
        });
      },
    }),
  ],
});

const registerVidaTool = vidaPlugin.register;
vidaPlugin.register = (api) => {
  registerVidaTool(api);

  api.on('message_received', (event, context) => {
    if (context.channelId !== 'telegram') return;
    const runId = event.runId ?? context.runId;
    const senderId = event.senderId ?? context.senderId;
    const messageId = event.messageId ?? context.messageId;
    if (!runId || !senderId || !messageId) return;
    telegramDirectContext.record({ runId, senderId, messageId });
  });

  api.on('before_tool_call', (event, context) => {
    if (event.toolName !== 'vida_operation') return;
    if (event.params.operation !== 'inbox.capture.direct') return;
    if (context.agentId !== 'steward' || context.channelId !== 'telegram') {
      return { block: true, blockReason: 'Telegram direct capture is restricted to steward.' };
    }
    const runId = event.runId ?? context.runId;
    if (!runId) {
      return { block: true, blockReason: 'Trusted Telegram run identity is unavailable.' };
    }
    const transportContextToken = telegramDirectContext.issue(runId);
    if (!transportContextToken) {
      return { block: true, blockReason: 'Trusted Telegram message context is unavailable.' };
    }
    return {
      params: {
        ...event.params,
        transportContextToken,
      },
    };
  });

  api.on('agent_end', (event) => {
    if (event.runId) telegramDirectContext.clearRun(event.runId);
  });

  api.on('gateway_stop', () => {
    telegramDirectContext.clear();
  });
};

export default vidaPlugin;
