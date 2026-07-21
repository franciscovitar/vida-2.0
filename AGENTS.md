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

## Completion criteria

- The requested behavior is implemented without unrelated changes.
- Relevant typecheck, lint, Stylelint, formatting, tests, and build checks have been executed.
- The final diff has been reviewed for generated files, duplicate lockfiles, secrets, and accidental changes.
- Modified files, executed commands, validation results, remaining risks, and any skipped checks are reported.
