# Professional web template

Base reutilizable para proyectos de clientes con Next.js App Router, React, TypeScript, SCSS y CSS
Modules. No incluye Tailwind ni dependencias de interfaz.

## Requisitos

- Node.js 24
- npm 11

## Crear un proyecto nuevo

1. Copiá esta carpeta con un nombre nuevo.
2. Eliminá la carpeta `.git` si la copia proviniera de un repositorio existente.
3. Ejecutá `npm ci` para instalar las dependencias desde el `package-lock.json` incluido.
4. Cambiá `name`, título y metadatos del proyecto.
5. Ejecutá `npm run verify` antes del primer commit.

## Desarrollo

- `npm run dev`: servidor local.
- `npm run lint` / `npm run lint:fix`: ESLint para JavaScript y TypeScript.
- `npm run stylelint` / `npm run stylelint:fix`: Stylelint para CSS y SCSS.
- `npm run typecheck`: comprobación estricta de TypeScript.
- `npm run format` / `npm run format:check`: escritura o verificación con Prettier.
- `npm run check`: todas las validaciones estáticas.
- `npm run verify`: validaciones estáticas y build de producción.

La automatización de GitHub ejecuta `npm ci` y `npm run verify` en cada pull request y en los pushes
a `main`. Los comandos de Cursor están en `.cursor/commands` y las recomendaciones del editor en
`.vscode`.
