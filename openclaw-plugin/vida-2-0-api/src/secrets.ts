/**
 * Per-agent credential resolution boundary.
 *
 * This module declares the shape only. It never contains a real secret,
 * key ID, or default implementation that reads one. In production, the
 * OpenClaw adapter (`adapter/plugin.ts`) supplies a resolver backed by the
 * plugin's already-resolved config (`agents.<agentId>.keyId` /
 * `agents.<agentId>.secret`), which operators configure locally as
 * SecretRefs (env/file/exec) per `configContracts.secretInputs` in
 * `openclaw.plugin.json` -- OpenClaw's own host runtime resolves those
 * before this plugin's code ever runs. In tests, callers inject a fake
 * resolver returning fixed non-real values or `null`.
 */
import type { VidaAgentId } from './types.js';

export type VidaAgentCredential = {
  readonly keyId: string;
  readonly secret: string;
};

export type SecretResolver = (
  agentId: VidaAgentId,
) => Promise<VidaAgentCredential | null> | VidaAgentCredential | null;
