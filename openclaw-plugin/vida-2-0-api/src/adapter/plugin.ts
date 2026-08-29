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
 * SecretRef schema/resolution lifecycle -- corrected after real local TUI
 * evidence (`openclaw tui --local`) disproved the previous assumption that
 * OpenClaw always hands `factory`/`register(api)` an already-resolved
 * config snapshot. That held in isolated CLI diagnostics
 * (`plugins doctor`, `plugins inspect --runtime`, `config patch --dry-run`)
 * but not in the local embedded agent runtime path: `config.agents.steward`
 * arrived at this plugin as a raw SecretRef object, and three otherwise-
 * valid `vida_operation` calls failed before any network attempt because
 * the HMAC secret was an object, not a string. This plugin no longer
 * assumes host-side resolution timing either way:
 *
 * 1. `plugins.entries.vida-2-0-api.config` is still schema-validated
 *    against the RAW value loaded from `openclaw.json`, so every secret-
 *    bearing field is still typed `secretInputSchema()` (`string |
 *    SecretRef`), never `Type.String()` alone and never
 *    `Type.Unknown()`/`Type.Any()` (see `docs/block-6-openclaw-plugin.md`
 *    for the schema-validation-order evidence, which still holds).
 * 2. Whatever this plugin's `factory`/`execute` actually receives for a
 *    secret-bearing field -- a plain string (if some execution path did
 *    resolve it upstream) or a raw `SecretRef` object (if it did not) --
 *    is resolved HERE, explicitly, using OpenClaw's own public
 *    `resolveSecretRefValues` (`openclaw/plugin-sdk/secret-ref-runtime`),
 *    fed with the full `OpenClawConfig` from `api.config` (which every
 *    plugin host construction supplies, including the local embedded
 *    runtime). This plugin does not reimplement SecretRef resolution --
 *    it only ever calls OpenClaw's own exported resolver.
 * 3. A field that is not yet a plain string and not a well-formed
 *    `SecretRef` object, or that fails resolution, never reaches the
 *    dispatcher: `resolveAgentCredential`/`resolveSecretInputValue` return
 *    `null`, which fails the call closed (`missing-credential` for agent
 *    credentials, `invalid-configuration` for a configured-but-unresolved
 *    bypass) before any HMAC signing or network attempt. A `SecretRef`
 *    object can never be stringified into HMAC material: the dispatcher's
 *    own types (`VidaAgentCredential`, `VidaClientConfig`) only ever
 *    accept plain strings, and every value that reaches them here has
 *    already passed through this resolution boundary.
 *
 * `RawPluginConfig` (`Static<typeof ConfigSchema>`, matching what OpenClaw
 * actually hands the factory) and `ResolvedPluginConfig` (plain strings
 * only, matching what the dispatcher accepts) are kept as distinct named
 * types precisely so this boundary stays visible in the type system --
 * there is no more "trust the host resolved this" cast anywhere in this
 * file.
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
 * `activation` is omitted from this call, which is what produced an
 * earlier "generated metadata is stale" mismatch against the committed
 * manifest (which declares `onStartup: false`). Passing it here, matching
 * the manifest, keeps the plugin's real default posture -- not eagerly
 * loaded at Gateway startup, available only through explicit
 * tool-capability activation and per-agent allowlisting.
 *
 * `vercelProtectionBypass` is an optional, SecretRef-eligible config value
 * (see `configContracts.secretInputs` in `openclaw.plugin.json`) for a
 * protected Vercel Preview host. It is Vercel transport only: the dispatcher
 * maps it to exactly one fixed header, `x-vercel-protection-bypass`, added
 * after HMAC signing so it can never affect the canonical string. It is not
 * a tool parameter, so the model can never supply or override it, and it
 * only ever maps to that one fixed header name -- never an arbitrary one.
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
import { VIDA_AGENT_IDS, type VidaOperationCall } from '../types.js';

/**
 * Mirrors OpenClaw's own public `SecretRef` object shape exactly
 * (`{ source: 'env'|'file'|'exec'; provider: string; id: string }`,
 * confirmed against `openclaw`'s installed `types.secrets` module -- there
 * is no public TypeBox helper for it; the public `buildSecretInputSchema`
 * family in `openclaw/plugin-sdk/secret-input` is Zod-based and belongs to
 * the core `openclaw.json` config validator, not `defineToolPlugin`'s
 * TypeBox `configSchema`). Kept closed (`additionalProperties: false`) and
 * restricted to the three source kinds OpenClaw itself supports -- no
 * provider kind is invented here.
 */
const SecretRefSchema = Type.Object(
  {
    source: Type.Union([Type.Literal('env'), Type.Literal('file'), Type.Literal('exec')]),
    provider: Type.String({ minLength: 1 }),
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

/** A secret-bearing config field: a literal value or an OpenClaw SecretRef, never an arbitrary object. */
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

/** Builds one closed `{ operation: <literal>, input: <exact shape> }` variant. Generic so the literal type is preserved, not widened to `string`. */
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

const HealthCallSchema = Type.Object(
  { operation: Type.Literal('system.health') },
  { additionalProperties: false },
);

/** Exported for `plugin.integration.test.ts` only -- runtime behavior is unaffected by this export. */
export const VidaOperationParamsSchema = Type.Union([
  ...ReadCallSchemas,
  ProposeCallSchema,
  HealthCallSchema,
]);

/* -------------------------------------------------------------------------- */
/* Plugin config schema and the raw/resolved boundary                        */
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

/** Exactly what OpenClaw hands the factory/execute: secret fields may still be raw SecretRef objects. */
type RawPluginConfig = Static<typeof ConfigSchema>;
type RawSecretInput = string | SecretRef;
type RawAgentCredential = { keyId: RawSecretInput; secret: RawSecretInput };

/** What the dispatcher/HMAC path accepts: secret fields are always plain, non-empty strings. */
type ResolvedAgentCredential = { keyId: string; secret: string };
type ResolvedPluginConfig = {
  baseUrl: string;
  vercelProtectionBypass?: string;
  agents?: Partial<Record<(typeof VIDA_AGENT_IDS)[number], ResolvedAgentCredential>>;
};

/**
 * Resolves one secret-bearing field to a plain string using OpenClaw's own
 * public `resolveSecretRefValues`, regardless of whether some upstream
 * execution path already resolved it. Never returns anything but a
 * non-empty string or `null` -- a `SecretRef` object can never pass
 * through this function unresolved, and resolution failures fail closed
 * (`null`) rather than throwing into caller code that might stringify the
 * value.
 */
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

function buildVidaOperationTool(
  agentId: (typeof VIDA_AGENT_IDS)[number],
  config: RawPluginConfig,
  api: OpenClawPluginApi,
): AnyAgentTool {
  return {
    name: 'vida_operation',
    label: 'Vida Operation',
    description:
      'Call one closed Vida 2.0 operation (a sanitized read, or a pending-only propose) as the current trusted Vida agent identity. The operation set, HTTP method, and path are fixed internally; no arbitrary URL, path, method, header, or credential can be supplied.',
    parameters: VidaOperationParamsSchema,
    async execute(_toolCallId, params) {
      const call = params as VidaOperationCall;

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
      factory({ api, config, toolContext }) {
        const agentId = toolContext.agentId;
        if (!agentId || !isVidaAgentId(agentId)) return null;
        if (!hasAnyDataCapability(agentId) && listAllowedOperationsForAgent(agentId).length <= 1) {
          // Only the universal system.health check would be offered; keep the
          // tool out of the model's hands entirely for an inert agent
          // (digital-order in this version) rather than exposing a
          // permanently-limited stub.
          return null;
        }
        return buildVidaOperationTool(agentId, config, api);
      },
    }),
  ],
});
