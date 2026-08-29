/**
 * Public barrel for the pure, framework-agnostic core of the Vida 2.0
 * OpenClaw plugin. Everything exported here depends only on Node built-ins
 * and is unit-tested directly (see ../../../tests/openclaw-plugin-*.test.ts
 * in the main Vida 2.0 web app repo).
 *
 * The OpenClaw SDK wiring lives separately in `./adapter/plugin.ts`, which
 * imports `openclaw/plugin-sdk/tool-plugin` and `typebox`. That file is the
 * thin, install-time adapter; it is intentionally excluded from this
 * barrel so the core stays installable and testable without those peer
 * dependencies present.
 */
export * from './types.js';
export * from './operations.js';
export * from './agents.js';
export * from './canonical.js';
export * from './request-id.js';
export * from './secrets.js';
export * from './dispatcher.js';
