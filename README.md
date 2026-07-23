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

También existen mocks tipados para desarrollo y pruebas. La pantalla Hoy compone las tres
integraciones. Cuando Google Calendar está seleccionado como fuente real y la lectura falla,
Agenda queda vacía con un aviso explícito: no se inyectan eventos simulados como fallback.
Hábitos permite una escritura controlada sobre el día actual en Sheets; Notion y Calendar no
tienen escritura desde la web.

Notion consulta los data sources autorizados de Áreas, Proyectos y Tareas. El Registro Web tiene
contrato tipado, repositorio Notion de solo lectura y ruta `/p/[slug]` detrás de una feature flag
apagada: no publica contenido mientras los recursos sigan ocultos.

## Registro Web (8B / 8C)

El código de `lib/web-catalog` define:

- contrato editorial con identidad estable, slugs, alias, navegación y políticas;
- repositorio Notion de solo lectura (sin create/update/delete);
- registro cerrado de renderers permitidos;
- validación determinística de colisiones y configuraciones inseguras;
- índice puro de resolución por slug o alias;
- lector recursivo acotado y modelo normalizado de contenido;
- resolución segura de enlaces Notion → `/p/[slug]` (sin URLs internas al cliente);
- navegación dinámica documental (flag activa) sin reemplazar módulos funcionales;
- breadcrumbs en `/p/[slug]`;
- búsqueda autenticada en `/buscar` (índice de texto cacheable; autorización siempre
  con el catálogo actual antes de devolver hits);
- rutas fijas `/norte`, `/aprendizaje` y `/compras` por clave estable;
- resúmenes visuales derivados para Norte, Aprendizaje, Compras, Dieta y Facultad;
- Facultad combina su panel funcional con el contenido canónico del Registro Web;
- barreras para privados, sistema, legacy y excluidos.

`WEB_CATALOG_ENABLED` está desactivada por defecto y solo acepta el valor exacto `true`.
Con la flag apagada: menú actual, placeholders de aprendizaje/compras y `/p` / `/buscar` no
publican contenido. Journaling permanece fuera de lector, navegación dinámica y búsqueda.

Módulos funcionales (Hoy, Hábitos, Salud, Productividad cuantitativa, Tendencias, Agenda, Tareas,
Proyectos, Áreas, Gimnasio, Bandeja, Ajustes) siguen en código. El catálogo gobierna páginas
documentales (`/p/...` y claves fijas). La Productividad documental usa su slug dinámico, no
`/productividad`.

### Áreas (8D.1)

Rutas read-only `/areas` y `/areas/[slug]` para las cuatro Áreas canónicas (`facultad`,
`genova-trabajo`, `salud`, `vida-personal`). El panel es una vista derivada: Notion sigue siendo
la fuente canónica de Áreas/Proyectos/Tareas; Calendar y Sheets aportan contexto cuando están
operativos. Fallos parciales se aíslan por fuente. Privacidad: sin Journaling, sin PII de
terceros en Trabajo, sin datos clínicos/financieros sensibles.

### Gimnasio (8D.2)

Ruta read-only `/gimnasio`. Notion (entrada canónica `renderMode=gym` del Registro Web) define la
rutina; Sheets aporta hábitos/métricas cuantitativas; Calendar aporta contexto temporal opcional.
Sin escritura de sesiones ni formularios de registro. Con `WEB_CATALOG_ENABLED=false` el módulo
muestra estado controlado.

### Escrituras seguras (8E.1)

Policy Engine, confirmaciones, Tareas, Bandeja, Gimnasio (sesiones), `/aprobaciones` y propuestas
de Calendar. **Desactivado por defecto** (`WRITE_ACTIONS_ENABLED` solo acepta `true`).

Con la flag activa y configuración completa en Preview, el runtime conecta adaptadores reales:

- Notion: tareas, Bandeja, propuestas, idempotencia y auditoría persistentes (base Acciones).
- Sheets: Gym Sessions / Gym Sets (PUT a filas libres; sin append destructivo).

La memoria de proceso queda solo para tests (`NODE_ENV=test`) o `WRITE_ACTIONS_USE_MEMORY=true`
en local — **nunca** como fallback silencioso en Preview/Production.

Para lectura operativa alineada con escritura real en Preview: `NOTION_DATA_SOURCE=notion`
(configurar en Vercel desde Work; no desde el código). Ver `docs/phase-8e-external-setup.md`
y `docs/adr/0002-safe-writes-runtime.md`. No crea eventos reales de Calendar.

### API OpenClaw (8F.1)

API HMAC server-to-server en `/api/openclaw/v1` **desactivada por defecto**
(`OPENCLAW_API_ENABLED`). OpenClaw solo lee contexto autorizado y crea propuestas `pending`;
no ejecuta escrituras finales ni aprueba. Ver `docs/openclaw-api.md` y
`docs/adr/0003-openclaw-api.md`.

Variable de servidor (sin valor en el repo): `NOTION_WEB_CATALOG_DATA_SOURCE_ID`.

Pendiente: activación controlada del catálogo/escrituras/OpenClaw por Work.

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
- `components/web-catalog`: renderer documental genérico y resúmenes estructurados por dominio.
- `app/(app)/p/[slug]`: ruta dinámica protegida (flag apagada ⇒ no publica).
- `lib/notion`: lectura autorizada de Áreas, Proyectos y Tareas.
- `lib/areas`: composición read-only de paneles de Área (`/areas`).
- `components/areas`: listado y panel genérico de Área.
- `lib/gym`: resolución gym, parser de rutina, analítica y carga de `/gimnasio`.
- `components/gym`: dashboard móvil read-only de Gimnasio.
- `lib/actions`: Policy Engine, payloads, motor de escritura, puertos e idempotencia.
- `components/actions`: formularios de escritura detrás de flag.
- `docs/phase-8e-external-setup.md`: checklist externo para Work.
- `lib/mock-data`: datos simulados por dominio.
- `lib/constants`: navegación y colores semánticos actuales.
- `docs/adr`: decisiones de arquitectura.
- `theme/`: proveedor de tema claro/oscuro.
- `types/`: contratos de dominio.
