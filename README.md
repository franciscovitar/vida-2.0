# Vida 2.0

Aplicación web personal para centralizar Vida 2.0: hábitos, salud, sueño, productividad,
proyectos, tareas, aprendizaje y otras áreas en una sola interfaz autenticada.

Construida con Next.js App Router, React, TypeScript, SCSS y CSS Modules.

## Estado actual

Production usa integraciones reales y separa cada fuente por responsabilidad:

- **Google Sheets:** hábitos, salud, sueño, productividad y métricas derivadas.
- **Notion:** Áreas, Proyectos y Tareas, actualmente en solo lectura.
- **Google Calendar:** eventos y bloques de tiempo, en solo lectura.
- **Web:** vistas derivadas y funciones específicas; no es una fuente de verdad paralela.

También existen mocks tipados para desarrollo, pruebas y fallbacks etiquetados. La pantalla Hoy
compone las tres integraciones. Hábitos permite una escritura controlada sobre el día actual en
Sheets; Notion y Calendar no tienen escritura desde la web.

Notion consulta los data sources autorizados de Áreas, Proyectos y Tareas. El Registro Web tiene
contrato tipado, repositorio Notion de solo lectura y ruta `/p/[slug]` detrás de una feature flag
apagada: no publica contenido mientras los recursos sigan ocultos.

## Registro Web (8B)

El código de `lib/web-catalog` define:

- contrato editorial con identidad estable, slugs, alias, navegación y políticas;
- repositorio Notion de solo lectura (sin create/update/delete);
- registro cerrado de renderers permitidos;
- validación determinística de colisiones y configuraciones inseguras;
- índice puro de resolución por slug o alias;
- lector recursivo acotado de bloques y modelo normalizado de contenido;
- barreras para recursos privados, de sistema, legacy y excluidos;
- ruta dinámica protegida `/p/[slug]` (autenticación + flag + política).

`WEB_CATALOG_ENABLED` está desactivada por defecto y solo acepta el valor exacto `true`.
Existe un repositorio Notion de solo lectura, lector recursivo acotado, renderer documental y la
ruta protegida `/p/[slug]`. Con la flag apagada la ruta responde como no encontrada y no publica
contenido. Journaling y demás recursos privados/ocultos/legacy/excluidos no se leen. No hay
escritura hacia Notion ni entradas nuevas en la navegación.

El mapper del Registro Web reconoce el esquema técnico real de Notion (`Name`, `stableKey`,
`sourceRef` URL, `aliases` rich_text, etc.) y mantiene compatibilidad temporal con los nombres
editoriales anteriores. `sourceRef` se valida solo en servidor (URL Notion o relation); no hay
fallback a la fila del catálogo. Los aliases usan el formato **un alias por línea**. Ni la URL ni
el id interno se envían al cliente.

Variable de servidor (sin valor en el repo): `NOTION_WEB_CATALOG_DATA_SOURCE_ID`.

Pendiente para 8C: activación controlada, publicación editorial, renderers especiales, navegación
y búsqueda.

## Google Sheets (selector DEV / canónico)

La fuente cuantitativa canónica es el Sheet de Production. Los productores externos continúan
escribiendo solo allí y nunca deben redirigirse al Sheet DEV.

La app elige el Sheet con variables de servidor, nunca desde el navegador:

| Entorno           | Target | Escrituras de hábitos                          |
| ----------------- | ------ | ---------------------------------------------- |
| Local             | `dev`  | Solo DEV                                       |
| Vercel Preview    | `dev`  | Solo DEV; `target=prod` se rechaza             |
| Vercel Production | `prod` | Solo si `GOOGLE_SHEETS_ALLOW_PROD_WRITES=true` |

- `DATA_SOURCE=mock` o ausente: datos simulados.
- `DATA_SOURCE=google`: lee las pestañas operativas del target resuelto.
- No existe fallback automático entre DEV y Production.

### Variables

Ver `.env.example`. Resumen:

- `GOOGLE_SHEETS_TARGET`: `dev` o `prod`.
- `GOOGLE_SHEETS_DEV_ID` / `GOOGLE_SHEETS_PROD_ID`: referencias solo de entorno.
- `GOOGLE_SHEETS_ALLOW_PROD_WRITES`: exactamente `true` para escribir en el canónico.

Si el target está ausente y existe la referencia DEV, se usa DEV por compatibilidad temporal.
Nunca se resuelve Production de forma implícita.

### Rollback

El rollback técnico conserva la referencia DEV y deshabilita escrituras productivas. No toca los
productores externos ni modifica las hojas.

## Requisitos

- Node.js 24.
- npm 11.

## Uso

1. `npm ci`: instala dependencias desde `package-lock.json`.
2. `npm run dev`: inicia el servidor local.
3. `npm test`: ejecuta las pruebas con `node:test` y `tsx`.
4. `npm run verify`: ejecuta validaciones estáticas y el build de Production.

## Comandos

- `npm run dev`: servidor local.
- `npm run lint` / `npm run lint:fix`: ESLint para JavaScript y TypeScript.
- `npm run stylelint` / `npm run stylelint:fix`: Stylelint para CSS y SCSS.
- `npm run typecheck`: comprobación estricta de TypeScript.
- `npm run format` / `npm run format:check`: escritura o verificación con Prettier.
- `npm run check`: todas las validaciones estáticas.
- `npm test`: suite de `node:test`.
- `npm run verify`: validaciones estáticas y build de Production.

## Estructura

- `app/`: rutas del App Router sobre un layout compartido.
- `components/layout`: shell de la aplicación.
- `components/navigation`: navegación y enlaces con estado activo.
- `components/dashboard`: secciones de Hoy.
- `components/ui`: componentes reutilizables.
- `lib/web-catalog`: contrato, repositorio Notion read-only, lector y política del Registro Web.
- `components/web-catalog`: renderer documental genérico.
- `app/(app)/p/[slug]`: ruta dinámica protegida (flag apagada ⇒ no publica).
- `lib/notion`: lectura autorizada de Áreas, Proyectos y Tareas.
- `lib/mock-data`: datos simulados por dominio.
- `lib/constants`: navegación y colores semánticos actuales.
- `docs/adr`: decisiones de arquitectura.
- `theme/`: proveedor de tema claro/oscuro.
- `types/`: contratos de dominio.
