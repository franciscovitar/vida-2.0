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

Notion y Google Calendar todavía **no** están conectados. La pantalla Hoy ya puede leer,
de forma segura y solo lectura, el Google Sheet DEV (ver más abajo).

## Integración Google Sheets DEV (fase 2A)

Integración **solo de lectura** con el Sheet DEV, del lado del servidor. La clave privada
nunca llega al navegador y no existe ninguna operación de escritura.

- `DATA_SOURCE=mock` (o sin definir): usa los datos simulados.
- `DATA_SOURCE=google`: lee las pestañas **Registro diario** y **Salud y experimentos** del
  Sheet DEV. Si faltan credenciales o hay un error, sigue funcionando con mocks y muestra
  un aviso discreto.

Capa de datos:

- `lib/data`: configuración de entorno y proveedor `getTodayData` (conmutación mock/google).
- `lib/google`: cliente de Google Sheets (solo servidor, scope `spreadsheets.readonly`).
- `lib/adapters`: parseo de celdas, fechas (zona horaria de Argentina) y transformación.
- `lib/validation`: validación de encabezados y del ID del spreadsheet (solo el Sheet DEV).

### Variables de entorno

Copiá `.env.example` a `.env.local` (ignorado por Git) y completá:

- `DATA_SOURCE`: `mock` o `google`.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: email de la cuenta de servicio.
- `GOOGLE_PRIVATE_KEY`: clave privada (con `\n` como saltos de línea).
- `GOOGLE_SHEETS_DEV_ID`: ID del Sheet DEV (único ID permitido).

### Pasos para la cuenta de servicio

1. En Google Cloud, creá un proyecto y habilitá **Google Sheets API**.
2. Creá una **cuenta de servicio** y una **clave JSON**.
3. Copiá `client_email` y `private_key` del JSON a `.env.local`.
4. Compartí el Sheet DEV con ese `client_email` en modo **Lector**.
5. Poné `DATA_SOURCE=google` y reiniciá el servidor.

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
