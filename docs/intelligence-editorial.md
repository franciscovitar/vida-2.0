# Intelligence Editorial V2

`/inteligencia` is Vida 2.0's authenticated presentation of canonical PAS editorial intelligence.

## Boundary

- Professional = what to do.
- Intelligence = what is happening, what it means and why.

PAS owns the runtime, current pointers, persistent archive and article bodies. Vida stores sanitized generated derivatives only. Professional/system-maintenance still own current priorities and technology dispositions.

## Surface

Routes:

- `/inteligencia` — current magazine cover;
- `/inteligencia/archivo` — voluntary library;
- `/inteligencia/ia/<slug>`;
- `/inteligencia/carrera/<slug>`;
- `/inteligencia/tecnologia/<slug>`;
- `/inteligencia/pas/<slug>`.

The four permanent fronts are IA esta semana, Carrera & futuro, Tecnología explicada and Tu PAS. Deep dives are a format, not a fifth front.

The home never reproduces `Tu radar ahora`, Professional top lists or technology status lists.

## Archive

CURRENT replaces only current article pointers. Published articles stay in ARCHIVE.

Archive is not a backlog: no unread counts, streaks, catch-up pressure or reading debt.

## Cross-links

Canonical article metadata may contain:

- `priority:<exact capability label>`
- `technology:<Professional technology id>`

Professional derives `Entender por qué →` from those refs only when matching material editorial content exists. Intelligence links back to `/professional` for the current decision.

## Validation

The generated index and each article fail closed when schema, id/front/slug/title, PAS commit/ref or canonical article ref do not match.

Each article has its own re-verification date. Historical content stays readable after that date, with a warning before it is treated as current evidence.

Before merge observe dedicated tests, full tests, TypeScript, ESLint, Stylelint, Prettier, build and Preview route/navigation checks.
