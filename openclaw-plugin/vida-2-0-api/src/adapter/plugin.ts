/**
 * OpenClaw SDK wiring for the Vida 2.0 plugin.
 *
 * This is the only file in the plugin that imports `openclaw/plugin-sdk/*`
 * and `typebox`. It is intentionally thin: all request-building, HMAC
 * signing, routing, and fail-closed logic lives in the pure core
 * (`../dispatcher.ts` and friends) and is unit-tested there without this
 * file or its peer dependencies.
 *
 * Trusted identity: the tool is declared with a `factory`, not a plain
 * `execute`, specifically because only `ToolPluginFactoryContext.toolContext`
 * (an `OpenClawPluginToolContext`) carries the runtime-supplied `agentId`.
 * The model can never supply or override `agentId` -- it is not a tool
 * parameter. When `toolContext.agentId` is missing, unrecognized, or
 * belongs to an agent with zero Vida-data capability (`digital-order` in
 * this version), the factory returns `null` and the tool is not registered
 * for that run at all -- there is no partially-registered, always-denied
 * tool sitting in front of the model.
 *
 * Per-agent credentials are never literal in this file or in
 * `openclaw.plugin.json`. Operators configure `agents.<agentId>.keyId` /
 * `agents.<agentId>.secret` in their local OpenClaw config as SecretRefs
 * (env/file/exec); see `configContracts.secretInputs` in
 * `openclaw.plugin.json`. OpenClaw resolves those before this plugin's
 * `config` object is populated, so this file only ever sees plain already-
 * resolved strings (or nothing, for an unconfigured agent) -- never a ref
 * object and never a value this repository wrote.
 *
 * `payloadTextResult`/`failedTextResult` are imported from
 * `openclaw/plugin-sdk/agent-runtime`, not `openclaw/plugin-sdk/core`:
 * confirmed against the installed openclaw@2026.7.1-2 package that
 * `core.d.ts` does not export either helper, while `agent-runtime.d.ts`
 * does (both re-export the same underlying `common-CZ-od2BP` helpers).
 * `agent-runtime` is documented as a deprecated broad barrel for other,
 * unrelated helpers, but it is still the only public plugin-sdk subpath
 * that exports these two -- there is no narrower alternative to prefer.
 * They are needed only because a `factory`-built tool's `execute` bypasses
 * `defineToolPlugin`'s own result wrapping (verified in the installed
 * `tool-plugin` runtime source): a plain `tool({ execute })` result gets
 * wrapped automatically, but a `factory`-returned `AnyAgentTool.execute`
 * must already return a complete `AgentToolResult`.
 *
 * `activation` is passed explicitly and kept identical to
 * `openclaw.plugin.json`'s `activation` block. The installed
 * `defineToolPlugin` runtime source defaults to `{ onStartup: true }` when
 * `activation` is omitted from this call, which is what produced the
 * "generated metadata is stale" mismatch against the committed manifest
 * (which declares `onStartup: false`). Passing it here, matching the
 * manifest, keeps the plugin's real default posture -- not eagerly loaded
 * at Gateway startup, available only through explicit tool-capability
 * activation and per-agent allowlisting.
 *
 * `vercelProtectionBypass` is an optional, SecretRef-eligible config value
 * (see `configContracts.secretInputs` in `openclaw.plugin.json`) for a
 * protected Vercel Preview host. It is Vercel transport only: the dispatcher
 * maps it to exactly one fixed header, `x-vercel-protection-bypass`, added
 * after HMAC signing so it can never affect the canonical string. It is not
 * a tool parameter, so the model can never supply or override it, and it
 * only ever maps to that one fixed header name -- never an arbitrary one.
 */
import { Type, type Static } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';
import {
  failedTextResult,
  payloadTextResult,
  type AnyAgentTool,
} from 'openclaw/plugin-sdk/agent-runtime';

import { hasAnyDataCapability, isVidaAgentId, listAllowedOperationsForAgent } from '../agents.js';
import { executeVidaOperation, type VidaOperationResult } from '../dispatcher.js';
import { createDefaultRequestIdGenerator } from '../request-id.js';
import { VIDA_AGENT_IDS, type VidaOperationCall } from '../types.js';

const UnknownInput = Type.Unknown();

const ReadOperationLiteral = Type.Union([
  Type.Literal('system.overview'),
  Type.Literal('areas.list'),
  Type.Literal('areas.get'),
  Type.Literal('tasks.list'),
  Type.Literal('projects.list'),
  Type.Literal('calendar.upcoming'),
  Type.Literal('gym.summary'),
  Type.Literal('approvals.list'),
  Type.Literal('documents.search'),
  Type.Literal('document.get'),
  Type.Literal('technical.status'),
  Type.Literal('technical.logs'),
]);

const ProposeOperationLiteral = Type.Union([
  Type.Literal('task.create.propose'),
  Type.Literal('task.change-status.propose'),
  Type.Literal('inbox.capture.propose'),
  Type.Literal('gym.session.create.propose'),
  Type.Literal('calendar.hold.create.propose'),
]);

const ReadCallSchema = Type.Object({
  operation: ReadOperationLiteral,
  input: UnknownInput,
});

const ProposeCallSchema = Type.Object({
  operation: ProposeOperationLiteral,
  idempotencyKey: Type.String({ minLength: 1 }),
  reason: Type.String({ minLength: 1 }),
  expectedChange: Type.String({ minLength: 1 }),
  risk: Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')]),
  reversible: Type.Boolean(),
  targetKey: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  payload: UnknownInput,
});

const HealthCallSchema = Type.Object({
  operation: Type.Literal('system.health'),
});

const VidaOperationParamsSchema = Type.Union([ReadCallSchema, ProposeCallSchema, HealthCallSchema]);

const AgentCredentialSchema = Type.Object(
  {
    keyId: Type.String({ minLength: 1 }),
    secret: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const ConfigSchema = Type.Object(
  {
    baseUrl: Type.String({
      minLength: 1,
      description: 'Vida origin only, e.g. https://vida.example.com. No path, no query string.',
    }),
    vercelProtectionBypass: Type.Optional(
      Type.String({
        minLength: 1,
        description:
          'Optional fixed Vercel Deployment Protection bypass value for a protected Preview host. Sent only as the exact header x-vercel-protection-bypass; never signed, never part of the body or a query string, never a substitute for Vida HMAC.',
      }),
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

type PluginConfig = Static<typeof ConfigSchema>;

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

function buildVidaOperationTool(
  agentId: (typeof VIDA_AGENT_IDS)[number],
  config: PluginConfig,
): AnyAgentTool {
  return {
    name: 'vida_operation',
    label: 'Vida Operation',
    description:
      'Call one closed Vida 2.0 operation (a sanitized read, or a pending-only propose) as the current trusted Vida agent identity. The operation set, HTTP method, and path are fixed internally; no arbitrary URL, path, method, header, or credential can be supplied.',
    parameters: VidaOperationParamsSchema,
    async execute(_toolCallId, params) {
      const call = params as VidaOperationCall;
      const result = await executeVidaOperation({
        agentId,
        call,
        config: {
          baseUrl: config.baseUrl,
          vercelProtectionBypass: config.vercelProtectionBypass,
        },
        deps: {
          fetch,
          now: () => Date.now(),
          requestId: createDefaultRequestIdGenerator(),
          resolveSecret: () => config.agents?.[agentId] ?? null,
        },
      });
      return toToolResult(result);
    },
  };
}

export default defineToolPlugin({
  id: 'vida-2-0-api',
  name: 'Vida 2.0 API',
  description:
    'Closed, typed bridge from one isolated local Vida agent to the private Vida 2.0 OpenClaw API (HMAC v2, read-only or pending-proposal only, no Journaling).',
  // Kept identical to openclaw.plugin.json's "activation" block -- see the
  // file-level comment above for why this must be explicit.
  activation: {
    onStartup: false,
    onCapabilities: ['tool'],
  },
  configSchema: ConfigSchema,
  tools: (tool) => [
    tool({
      name: 'vida_operation',
      label: 'Vida Operation',
      description:
        'Call one closed Vida 2.0 operation as the current trusted Vida agent identity. See the factory implementation for the fixed operation, routing, and credential contract.',
      parameters: VidaOperationParamsSchema,
      optional: true,
      factory({ config, toolContext }) {
        const agentId = toolContext.agentId;
        if (!agentId || !isVidaAgentId(agentId)) return null;
        if (!hasAnyDataCapability(agentId) && listAllowedOperationsForAgent(agentId).length <= 1) {
          // Only the universal system.health check would be offered; keep the
          // tool out of the model's hands entirely for an inert agent
          // (digital-order in this version) rather than exposing a
          // permanently-limited stub.
          return null;
        }
        return buildVidaOperationTool(agentId, config);
      },
    }),
  ],
});
