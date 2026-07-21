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

Notion todavía no expone páginas ni bloques completos: la integración actual solo consulta los
data sources autorizados de Áreas, Proyectos y Tareas. El futuro Registro Web está en preparación.
La subetapa 8B.1 incorpora únicamente su contrato tipado, validaciones, índice de resolución y una
feature flag apagada; no conecta Notion, rutas, navegación ni UI.

## Registro Web (8B.1)

El código de `lib/web-catalog` define:

- contrato editorial con identidad estable, slugs, alias, navegación y políticas;
- repositorio abstracto de solo lectura;
- registro cerrado de renderers permitidos;
- validación determinística de colisiones y configuraciones inseguras;
- índice puro de resolución por slug o alias;
- barreras para recursos privados, de sistema, legacy y excluidos.

`WEB_CATALOG_ENABLED` está desactivada por defecto y solo acepta el valor exacto `true`. En 8B.1
la flag no se consume desde rutas o componentes, por lo que no cambia el comportamiento visible.
No existen filas reales del catálogo en código ni una conexión del catálogo con Notion.

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
- `lib/web-catalog`: contrato operativo de 8B.1, sin conexión externa.
- `lib/notion`: lectura autorizada de Áreas, Proyectos y Tareas.
- `lib/mock-data`: datos simulados por dominio.
- `lib/constants`: navegación y colores semánticos actuales.
- `docs/adr`: decisiones de arquitectura.
- `theme/`: proveedor de tema claro/oscuro.
- `types/`: contratos de dominio.
