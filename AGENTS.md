# Professional web template

## Stack

- Next.js 16 using the App Router.
- React 19.
- TypeScript with strict checking.
- SCSS and CSS Modules.
- npm, with package-lock.json as the single lockfile.

## Architecture

- app/layout.tsx defines the root document and shared metadata.
- app/page.tsx is the current route entry point.
- Global styles live in app/globals.scss.
- Component-scoped styles use *.module.scss.
- Use Server Components by default.
- Add use client only when browser APIs, state, effects, event handlers, or client-only libraries require it.
- Project tooling is configured through ESLint, Stylelint, Prettier, TypeScript, EditorConfig, and .vscode.

## Commands

- npm run dev: start the local development server.
- npm run build: create a production build.
- npm run start: serve the production build.
- npm run lint: run ESLint.
- npm run lint:fix: run ESLint with safe automatic fixes.
- npm run stylelint: check every CSS and SCSS file.
- npm run stylelint:fix: run Stylelint with safe automatic fixes.
- npm run typecheck: generate Next.js route types and run TypeScript without emitting files.
- npm run format: format supported files with Prettier.
- npm run format:check: verify Prettier formatting without writing files.
- npm run check: run typecheck, ESLint, Stylelint, and the Prettier check.
- npm run verify: run all static checks and then the production build.

## Working rules

- Inspect related files before editing.
- Detect the package manager from the existing lockfile. Never create a second lockfile.
- Make the smallest coherent change and leave unrelated files untouched.
- Preserve behavior, responsive layouts, routes, copy, and visual identity unless requested.
- Install dependencies only when the requested change requires them.
- Avoid any; use precise types and narrowing.
- Review the final diff and never claim a check passed unless it was executed.

## Vida 2.0 invariants

- Keep one source of truth per datum: Notion for content and definitions, Sheets for metrics,
  Calendar for time, and the web for derived views and bounded functions.
- Never delete, archive, merge, move, or change system architecture without explicit approval.
- Never read Journaling automatically. Private access must be explicit, temporary, and scoped.
- Never expose secrets, provider tokens, emails, source references, or internal identifiers to the
  client, logs, documentation, or commits.
- Never hardcode real Web Catalog rows in production code or tests.
- Do not turn derived views into new sources of truth.
- Keep critical privacy, authorization, renderer, and write barriers in code even when the same
  rules are documented in Notion.
- A catalog entry may select only a renderer registered in code; external text is never executable.
- New catalog resources are drafts by default and never become visible through discovery alone.

## External setup / Work resume protocol

These rules apply whenever an agent resumes or performs external setup involving Preview/Vercel,
n8n, tunnels, temporary stores, browser-based OAuth, OpenClaw, or external E2E validation.

- Before acting, read `docs/WORK-CHECKPOINT.md` when it exists.
- Treat the checkpoint as a handoff, not as live truth. Revalidate every volatile fact that matters
  before acting: deployment/SHA, environment flags, tunnel reachability, service process state,
  temporary infrastructure, authentication state, and readiness gates. Never reconstruct the
  workflow from chat memory alone.
- Human-browser authentication is a valid part of the workflow. If the user completed OAuth/login
  in their own browser, do not restart the setup merely because an agent-controlled browser does
  not share that session. Verify the resulting external state or effect; request re-authentication
  only when that verification fails or the authorization is actually expired.
- Tailscale is the current preferred stable tunnel for this workflow. Do not replace it with
  Cloudflare Tunnel, ngrok, or a newly-created tunnel unless Tailscale is verified broken or
  incompatible, or the user explicitly asks for a different transport.
- Validate sensitive integrations and E2E flows in Preview/dev first. Do not touch Production for
  setup, recovery, or final validation unless the user explicitly authorizes the Production action
  and the required backup/recovery gate is satisfied.
- Repair the narrowest verified blocker. If a temporary dependency such as Upstash expires or
  fails, restore or replace that dependency and then revalidate readiness; do not redeploy or
  reconfigure unrelated infrastructure without evidence that it is also broken.
- Readiness is a hard gate. Do not run the final external E2E while required readiness checks are
  failing or unknown. Stop at the first verified blocker, repair it, and re-check.
- After readiness returns to PASS, run one deliberate final E2E chain rather than repeatedly
  replaying side-effecting steps. Preserve idempotency and audit evidence where the implementation
  supports them.
- Never claim that a service is connected, a deployment is READY, a gate is PASS, or an E2E was
  executed based only on a previous prompt or checkpoint. State what was actually verified and by
  what observable result.
- Update `docs/WORK-CHECKPOINT.md` at meaningful pause/resume boundaries. Keep only sanitized
  operational state, blockers, completed gates, and the exact next action. Never store secrets,
  tokens, emails, provider credentials, or sensitive payloads there.
- Do not recreate working architecture during recovery. Preserve verified-good components and fix
  only the delta unless evidence shows that the approach itself is wrong.

## Completion criteria

- The requested behavior is implemented without unrelated changes.
- Relevant typecheck, lint, Stylelint, formatting, tests, and build checks have been executed.
- The final diff has been reviewed for generated files, duplicate lockfiles, secrets, and accidental changes.
- Modified files, executed commands, validation results, remaining risks, and any skipped checks are reported.
