# Vida 2.0

Aplicaci?n web personal para centralizar mi sistema **Vida 2.0**: h?bitos, salud, sue?o,
productividad, proyectos, tareas, aprendizaje y m?s, en una sola interfaz.

Construida con Next.js App Router, React, TypeScript, SCSS y CSS Modules.

## Estado actual (fase 1)

- Interfaz y estructura completas con **datos simulados**, tipados y separados de la UI
  (`lib/mock-data` + `types`).
- Pantalla **Hoy** desarrollada: foco del d?a, resumen, agenda, tareas, h?bitos, salud,
  productividad, progreso semanal y captura r?pida.
- Resto de secciones con rutas creadas y estados vac?os cuidados.
- Modo claro y oscuro con preferencia del sistema y selector manual (Ajustes).

## Google Sheets (selector DEV / canónico)

Una sola fuente canónica final: el Sheet de producción («Sistema de hábitos y
compromisos»). ActivityWatch, Huawei / Health Auto Export y Apps Script escriben
**solo** en el canónico; nunca deben redirigirse al Sheet DEV.

La app elige el Sheet con variables de servidor (nunca desde el navegador):

| Entorno                          | Target | Escrituras de hábitos                          |
| -------------------------------- | ------ | ---------------------------------------------- |
| Local                            | `dev`  | Solo DEV (`ALLOW_PROD_WRITES` no aplica)       |
| Vercel Preview                   | `dev`  | Solo DEV; `target=prod` se rechaza             |
| Vercel Production (corte futuro) | `prod` | Solo si `GOOGLE_SHEETS_ALLOW_PROD_WRITES=true` |

- `DATA_SOURCE=mock` (o sin definir): datos simulados.
- `DATA_SOURCE=google`: lee **Registro diario** y **Salud y experimentos** del target
  resuelto. Sin fallback automático entre DEV y producción.

### Variables

Ver `.env.example`. Resumen:

- `GOOGLE_SHEETS_TARGET`: `dev` \| `prod`
- `GOOGLE_SHEETS_DEV_ID` / `GOOGLE_SHEETS_PROD_ID`: IDs (solo env; sin hardcode)
- `GOOGLE_SHEETS_ALLOW_PROD_WRITES`: exactamente `true` para escribir en canónico

Compatibilidad temporal: si `TARGET` está ausente y existe `GOOGLE_SHEETS_DEV_ID`,
se usa DEV. Nunca se resuelve producción de forma implícita.

### Corte productivo (Fase 7C-D, manual)

1. Backup completo del Sheet canónico; validar la copia.
2. Service account → Editor en el canónico (hoy puede seguir como Lector).
3. Vercel Production: `TARGET=prod`, IDs correctos, `ALLOW_PROD_WRITES=true`.
4. Preview y local permanecen en `TARGET=dev`.

### Rollback

En Vercel Production: `GOOGLE_SHEETS_TARGET=dev` (y `ALLOW_PROD_WRITES=false`).
La app vuelve al Sheet DEV sin tocar ActivityWatch ni el canónico.

## Requisitos

- Node.js 24
- npm 11

## Uso

1. `npm ci`: instala dependencias desde `package-lock.json`.
2. `npm run dev`: servidor local en `http://localhost:3000`.
3. `npm run verify`: validaciones est?ticas y build de producci?n.

## Comandos

- `npm run dev`: servidor local.
- `npm run lint` / `npm run lint:fix`: ESLint para JavaScript y TypeScript.
- `npm run stylelint` / `npm run stylelint:fix`: Stylelint para CSS y SCSS.
- `npm run typecheck`: comprobaci?n estricta de TypeScript.
- `npm run format` / `npm run format:check`: escritura o verificaci?n con Prettier.
- `npm run check`: todas las validaciones est?ticas.
- `npm test`: pruebas de la capa de datos (reglas de celdas, fechas, validaciones).
- `npm run verify`: validaciones est?ticas y build de producci?n.

## Estructura

- `app/`: rutas del App Router (una por secci?n) sobre un layout compartido.
- `components/layout`: shell de la aplicaci?n (sidebar, header, navegaci?n m?vil).
- `components/navigation`: navegaci?n y enlaces con estado activo.
- `components/dashboard`: secciones de la pantalla Hoy.
- `components/ui`: componentes reutilizables (tarjetas, m?tricas, badges, etc.).
- `lib/mock-data`: datos simulados por dominio.
- `lib/constants`: navegaci?n y colores sem?nticos.
- `theme/`: proveedor de tema claro/oscuro.
- `types/`: contratos de dominio.
