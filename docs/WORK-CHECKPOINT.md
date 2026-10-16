# Vida 2.0 — Work checkpoint

## Assessment Progress — cierre DEV local, 2026-10-16

- `VERIFIED`: contratos de PAS main revisados; proyección estricta del cierre y
  reductor puro de despacho añadidos en rama aislada. Se reutilizan parser y
  reconciliación existentes. Fixtures nuevos exclusivamente sintéticos.
- QA local: 162/162 tests focales, typecheck, ESLint focal, Stylelint, Prettier,
  diff-check y build completo PASS. CAS probado solo con modelo de tests.
- `OWNER_REPORTED`: transporte individual académico DEV → readback → QA autenticada
  confirmado por el owner. No se repitió ni se copiaron sus datos a GitHub.
- Evidencia posterior IOP: invocación real de lectores GitHub privado y Sheets DEV
  PASS; no repetir auditoría ni exigir otras seis materias. Writer pendiente.
- Auditoría CAS: APIs Vercel de integración Upstash y env metadata sin descifrar
  devolvieron 403. No hay credenciales locales; no se ejecutaron comandos del store.
  EVAL sin TTL no acredita por sí solo retención/aislamiento ni CAS tras failover.
  Apps MCP privadas con escritura en la cuenta IOP: owner responde NO VERIFICADO.
- `BLOCKED`: automatización recurrente sin emisor certificado ni prueba de CAS
  durable, aislamiento y retención no expirante. El modelo local no es un escritor.
- Alcance confirmado: los siete ChatGPT Projects deben cargar reglas compartidas
  e invocar una herramienta real. Su existencia está verificada por inventario;
  instrucciones/conexiones internas no son inspeccionables con esa API. Candidato
  PAS compartido preparado localmente, sin publicación ni configuración de Projects.
  PAS `3ff1d2d`: 14 tests estáticos PASS; APP: 31 tests del modelo repetidos PASS.
- `PRESERVED`: capacidades, Planning, Gate C, autenticación y escritores existentes.
  Sin filas reales, infraestructura, cambios remotos, push o deploy.
- `NEXT`: auditoría de lectura del store/emisor existente, adaptador mínimo solo
  tras garantías demostradas; luego autorización separada para un cierre IOP DEV.
  Detalle: `docs/assessment-progress-closeout-dev.md`.

## Planning V2 — Fase 4, estados de lectura, 2026-10-13

- `VERIFIED`: corrección local en rama aislada desde `ad9ff877…`: Hoy, Revisión y
  Prioridades distinguen fuente fallida de ausencia confirmada, mantienen avisos
  accesibles y no presentan prioridades filtradas como no-change verificado.
- QA: 67/67 tests de componentes/adaptadores/config, incluidos 18 renders React;
  11/11 tests lectores/config de Hábitos en su worktree intacto. Todos exit 0.
  Typecheck, ESLint y Prettier exit 0. No se repitió el gate Redis/escritor.
- Chromium local: 8/8 casos con datos sintéticos y SCSS real a 390/1440 px;
  sin overflow horizontal, labels/status válidos y Tab en enlaces de Hoy.
  Preview de componentes estáticos: no es el router completo ni E2E autenticado.
- `PARTIAL`: Hoy/Planificación tienen superficies V2 staged; Proyectos tiene modelo
  canónico probado; Aprendizaje tiene Faculty-first/catalog y preparación no medida;
  Hábitos V2 existe en su rama independiente, con controles de lectura y writers bloqueados.
- `PRESERVED`: los tres worktrees originales y sus SHAs no se modificaron.
  Sin flags, rutas V1, escritores, source bindings, push, CI, deploy o proveedores.
- `NEXT`: QA renderizada de Semana/Aprendizaje/Proyectos y reconciliación selectiva
  de consumidores read-only entre árboles antes de una vista integral de cinco páginas.
  Conservar avisos de fuentes del overlay; no mezclar ramas completas. Auth/source
  freshness y publicación DEV requieren sus propios gates; E2E autenticado NOT RUN.

Este archivo es el handoff durable para retomar setup externo y validaciones E2E sin depender de la
memoria del chat. **No es una fuente de verdad en vivo.** Todo dato volátil debe revalidarse antes de
actuar.

## Cómo usar este checkpoint

Al retomar trabajo:

1. leer este archivo antes de rehacer setup;
2. revalidar sólo los datos volátiles necesarios para el siguiente gate;
3. conservar los componentes ya verificados como correctos;
4. reparar el primer blocker real, no reconstruir el flujo completo;
5. no repetir E2E ya certificados sin evidencia de regresión;
6. actualizar este archivo al terminar o pausar, sin secretos ni datos sensibles.

Estados recomendados:

- `VERIFIED`: comprobado mediante evidencia observable en el cierre registrado;
- `LAST_KNOWN`: último estado registrado, debe revalidarse antes de actuar;
- `BLOCKED`: hay un blocker conocido;
- `DONE`: gate completado y no requiere repetición salvo regresión;
- `UNKNOWN`: falta evidencia actual.

## Bloque 5 — cierre

**B5 = DONE.**

- E2E funcional del briefing diario: `PASS`.
- Cero propuestas o escrituras externas no intencionadas en el cierre.
- Workflows programados inactivos.
- Runtime dedicado n8n detenido; puerto 5678 cerrado.
- Production sin cambios.

**Regla:** no repetir el E2E de B5 sin evidencia de regresión.

## Bloque 6 — cierre

**B6 = DONE.**

Implementación/runtime certificado sobre el plugin nativo `vida-2-0-api`. El commit de
implementación que recibió la certificación conversacional fue
`b574ec7dd467b9c8238a6efd4345648f23888590`; los commits posteriores de cierre son únicamente
higiene documental/de scripts y no cambian la arquitectura ni el runtime certificado.

### Arquitectura final certificada

```text
usuario
→ OpenClaw TUI local
→ agente Vida canónico
→ vida_operation
→ HMAC v2
→ Preview protegido de Vida /api/openclaw/v1
→ autorización y sanitización server-side
```

No se requiere Gateway persistente, n8n, MCP, túnel nuevo, Docker ni Codex app-server para B6.

### Agentes

| Agente               | Estado          | Runtime/model                             | Superficie efectiva                 | E2E certificado                         |
| -------------------- | --------------- | ----------------------------------------- | ----------------------------------- | --------------------------------------- |
| `steward`            | `DONE`          | `openai/gpt-5.5` sobre runtime `openclaw` | sólo `vida_operation`               | `system.overview`, HTTP 200, `ok=true`  |
| `health-reflection`  | `DONE`          | `openai/gpt-5.5` sobre runtime `openclaw` | sólo `vida_operation`               | `gym.summary`, HTTP 200, `ok=true`      |
| `technical-guardian` | `DONE`          | `openai/gpt-5.5` sobre runtime `openclaw` | sólo `vida_operation`               | `technical.status`, HTTP 200, `ok=true` |
| `digital-order`      | `DONE` / inerte | sin OAuth/credencial Vida                 | sin `vida_operation`; sandbox `all` | no corresponde                          |

Los tres agentes activos usan OAuth oficial OpenAI, perfiles agent-local y una política
model-scoped explícita `openai/gpt-5.5 → agentRuntime.id=openclaw`. Esto evita depender de la
selección implícita del harness Codex. El plugin Codex puede existir localmente, pero su app-server
administrado no es dependencia de B6.

### Seguridad y privacidad certificadas

- `vida_operation` es el único tool callable para los tres agentes activos.
- Denegaciones de filesystem, shell, browser, web y demás herramientas host preservadas.
- SecretRefs se resuelven dentro del adaptador antes de HMAC; no hay secretos literales en config,
  repo o handoffs.
- Tres pares HMAC agent-local y el bypass de Preview permanecen indirectos mediante SecretRefs y
  proveedor DPAPI CurrentUser.
- El servidor permaneció `read-only`; propuestas y escrituras: 0 en los E2E de cierre.
- Journaling: 0 y sin ruta disponible en el contrato del plugin.
- Sin promoción de memoria, sin `MEMORY.md`, sin memoria diaria y sin contexto cross-agent durable.
- Production no fue tocada.

### Persistencia local y artefactos retenidos

- Quedaron 6 sesiones B6 aisladas porque la instalación actual no ofrece borrado exacto seguro por
  sesión. No se inspeccionaron ni borraron sesiones ajenas.
- No hay TUI, Gateway, modelo/agente ni n8n persistente en ejecución al cierre.
- Docker quedó detenido y fuera de la arquitectura B6.
- Se preservan dos backups reversibles de runtimes efímeros de Docker creados durante el diagnóstico
  (`Docker\\run` y Secrets Engine). No restaurarlos ni borrarlos como parte de Vida; pertenecen a una
  decisión futura separada sobre Docker Desktop.
- El store/config de seguridad de Preview, OAuth agent-local, DPAPI y SecretRefs operativos se
  preservaron. Son estado externo: revalidar antes de cualquier reutilización futura.

### Caveat conocido

Durante `system.overview`, Calendar reportó un estado de autenticación no disponible. No fue blocker
de B6. Cualquier UI/agente que use ese snapshot debe describir la agenda como no verificable y no
inferir que no existen eventos.

## V1 — cierre post-merge

**V1 = DONE.**

Estado de integración verificado el 29/08/2026:

- B5 fue integrado a `main` mediante PR #3 (`MERGED`) con merge commit
  `b7d685f0695aac5a3d85acf2ac31a878f53f6afb`.
- B6 fue integrado a `main` mediante PR #4 (`MERGED`) usando exactamente el head final certificado
  `a55b40dd1edbfa1d366c5ca56db340bd09b5f741`.
- El merge commit que completa la integración funcional de V1 es
  `9bc8500e87b5871514cbfe7210bd12bae757632e`.
- QA final de V1 sobre el candidato exacto: `PASS` / `READY_TO_MERGE`.
- Vercel reportó `SUCCESS` para el merge commit de V1 en `main`.
- No hubo mutación manual de Production como parte de la integración.
- PR #1 y PR #2 permanecen cerrados sin merge como historial de los PRs draft originales; PR #3 y
  PR #4 son los PRs canónicos de integración.

**Regla de cierre:** no repetir `npm test`, `npm run verify`, B5 E2E ni B6 TUI E2E únicamente para
volver a certificar V1. Repetir validaciones sólo ante evidencia de regresión o cuando un cambio
posterior requiera una verificación focal propia.

Los próximos trabajos pertenecen a evolución posterior a V1. No hay una fase de integración o QA
final de V1 pendiente.

Las ramas históricas de B5/B6 e integración pueden conservarse mientras resulten útiles como
referencia. No borrarlas ni alterar recursos externos sólo por higiene; cualquier limpieza futura es
una tarea separada y debe revisar primero su utilidad y riesgo.

## Activación de fuentes base en Production — 29/08/2026

**FUENTES BASE PRODUCTION = DONE.**

Resultado operativo reportado y cerrado como `PASS`:

- Google Sheets Production quedó apuntando al target canónico `prod`.
- Antes del cambio se creó un backup recuperable y se reconciliaron únicamente los dos hábitos
  completados del día que existían en DEV y faltaban en PROD; Salud y productividad se preservaron.
- El gate canónico de escrituras de hábitos sobre PROD quedó habilitado.
- Google Calendar renovó OAuth con alcance de solo lectura y `/agenda` volvió a mostrar eventos
  reales.
- El productor local de ActivityWatch recuperó credencial y volvió a escribir las siete métricas de
  productividad del día en `Registro diario` PROD sin alterar otras columnas.
- Las vistas `/habitos`, `/salud`, `/agenda` y `/productividad` fueron verificadas con datos reales.
- El deployment Production permaneció `READY` sobre
  `eed1fbad76588dcd6ad4ddcce284d2869104c8f0` durante este pass operativo.
- No hubo escrituras en Notion, Calendar, OpenClaw, automatizaciones ni Journaling.
- No se modificó código de aplicación durante este pass; el único cambio posterior en Git es este
  cierre documental sanitizado.

**Regla:** no repetir esta activación ni resincronizar por certificación. Revalidar sólo ante
regresión observable o cuando un cambio posterior dependa de una de estas fuentes.

**Siguiente frontera al cierre de este pass:** OpenClaw/agentes, escrituras avanzadas y
automatizaciones seguían siendo trabajos separados. El estado posterior de OpenClaw Production se
registra más abajo.

## Recuperación del store de seguridad OpenClaw Preview — 29/08/2026

**OPENCLAW PREVIEW SECURITY STORE = VERIFIED.**

Durante la preparación de la activación de OpenClaw en Production se detectó que la cuenta Upstash
ya tenía una única base Free Tier, consistente con el store account-owned usado por OpenClaw Preview.
No se creó una segunda base persistente ni se agregó método de pago.

La inspección inicial produjo una copia accidental de una variable Sensitive al portapapeles local.
Como no pudo descartarse persistencia local, la credencial REST afectada de Preview se rotó mediante
el control oficial de Upstash. La credencial anterior quedó invalidada y el valor nuevo se transfirió
a Vercel Preview sin persistirlo en repo, chat, logs ni archivos.

Verificación posterior a la rotación: `PASS`.

- Store Upstash Preview operativo con el nuevo token.
- `SET NX` con TTL: PASS.
- `INCR` con expiración: PASS.
- `EVAL`: PASS.
- Claves de prueba eliminadas.
- Namespace verificado: `vida2:openclaw:preview:*`.
- Vercel Preview conserva exactamente una URL y un token Sensitive branch-scoped para el store.
- URL/base, B5, HMAC y Production permanecieron sin cambios durante esta recuperación.

**Regla:** no repetir la rotación ni las pruebas de recuperación salvo evidencia de regresión. El
siguiente gate de OpenClaw Production debe revalidar el aislamiento `preview`/`production` y puede
evaluar reutilizar esta misma base física sólo si el contrato vigente mantiene namespaces separados
y no se mezclan credenciales o recursos de B5.

## OpenClaw Production — activación final 29/08/2026

**OPENCLAW PRODUCTION = DONE.**

La primera activación Production alcanzó correctamente el store de seguridad y el aislamiento por
namespace, pero `steward → system.overview` devolvió HTTP 500. Se hizo rollback completo y se
diagnosticó una causa puntual de privacidad: eventos Calendar titulados `Journaling` llegaban al DTO
de OpenClaw y la frontera final `/journaling/i` los bloqueaba correctamente en fail-closed.

El fix mínimo se implementó en `fix/openclaw-calendar-privacy-filter`, head
`826b262d760f3696d7b766a5f8ef057d3cc1c2bd`, y se integró mediante PR #5. El merge commit canónico
fue `c248e0e2798510a59647c30e192c473837630f06`. El cambio filtra los eventos de Journaling antes del
DTO sólo para el lector server-to-server de OpenClaw; `/agenda` web conserva el Calendar real y la
frontera final de privacidad permanece intacta.

Gates observados antes del merge:

- GitHub Actions `Quality`: PASS sobre checkout limpio.
- Vercel Preview del head del fix: READY/PASS.
- Production del merge commit `c248e0e2798510a59647c30e192c473837630f06`: READY.

Reintento focal de activación Production: `PASS`.

- `steward → system.overview`: HTTP 200, `ok=true`.
- Tres eventos Calendar normales presentes en el DTO; Journaling ausente.
- `health-reflection → gym.summary`: HTTP 200, `ok=true`.
- `technical-guardian → technical.status`: HTTP 200, `ok=true`.
- `digital-order`: inerte, sin credencial ni herramienta Vida.
- Los tres agentes activos exponen únicamente `vida_operation`; herramientas host denegadas.
- Replay y rate limiting disponibles mediante Upstash.
- La misma base física de seguridad puede servir Preview y Production porque el contrato vigente
  mantiene namespaces separados; Production usa `vida2:openclaw:production:*` y Preview permanece
  aislado bajo `vida2:openclaw:preview:*`.
- Production usa tres pares HMAC nuevos y exclusivos, almacenados como Sensitive server-side y
  SecretRef/DPAPI local; no registrar sus valores en este archivo.
- Propuestas/escrituras: 0/0.
- Journaling: 0 accesos y ausente de las respuestas.
- OpenClaw queda activo en Production con `OPENCLAW_ACCESS_MODE=read-only`.
- `/ajustes` confirmó API configurada y los tres agentes operativos.
- No se modificaron B5, Preview, OAuth Calendar, Sheets, Notion ni automatizaciones durante el pass
  final.

**Regla:** no repetir la activación, las primitivas Upstash ni los E2E completos de B6 por simple
recertificación. Revalidar sólo ante regresión observable o si una evolución posterior cambia esta
frontera.

**Siguiente frontera:** Safe Writes/Aprobaciones es el próximo trabajo de activación. Automatizaciones
siguen separadas y deben tratarse después de validar escrituras, no como una simple flag adicional.

## Safe Writes Core Production — activación final 29/08/2026

**SAFE WRITES CORE PRODUCTION = DONE.**

El Core de escrituras reversibles quedó activo en Production después de completar los E2E focales de
Tareas, Bandeja y Gimnasio, corregir un defecto real de rollback de `task.create` y reparar la única
tarea QA legacy afectada. No repetir esos E2E por simple recertificación.

Estado canónico de código para el cierre operativo:

- PR #6 corrigió `task.create` para archivar realmente la página de Notion y verificar la
  postcondición antes de declarar rollback exitoso.
- PR #7 mantuvo `Notion-Version 2025-09-03` y alineó la operación de papelera con el contrato de esa
  versión mediante `archived=true`.
- PR #8 agregó una vía de mantenimiento autenticada, sin argumentos de recurso y fail-closed para
  cerrar la inconsistencia legacy mientras Safe Writes estaba apagado.
- El merge commit canónico que incluye esas correcciones y la vía de mantenimiento es
  `05e6d88455336e727e5260eeb54ed5f91cc2223c`.
- GitHub Actions `Quality` y Vercel Preview pasaron sobre el candidato de PR #8 antes del merge.

Evidencia funcional acumulada:

- `task.create`: creación controlada verificada; el primer rollback expuso el bug histórico que
  dejaba la tarea activa como `Algún día`.
- La misma tarea QA fue posteriormente reparada mediante la vía de mantenimiento: quedó archivada en
  la papelera de Notion, desapareció de `/tareas`, las tareas reales permanecieron intactas y el
  ledger histórico siguió terminal `rolled-back` sin crear nuevas propuestas.
- `inbox.capture`: E2E reversible certificado y rollback verificado.
- `gym.session.create`: E2E reversible certificado con una sesión y un set; rollback verificado con
  sesión `reverted`, filas conservadas y ledger terminal.
- No hubo que repetir Tareas, Bandeja ni Gym después de quedar certificados.

Activación final Production: `PASS`.

- Production quedó `READY` sobre el SHA exacto
  `05e6d88455336e727e5260eeb54ed5f91cc2223c`.
- `WRITE_ACTIONS_ENABLED=true` quedó activo en Production.
- Safe Writes Core reportó readiness operativa.
- La única degradación observada fue `calendar-write-id-missing`; es intencional y no crítica para
  Core.
- La activación final no ejecutó nuevas propuestas, E2E ni escrituras de datos.
- Calendar conserva lectura real y su superficie de escritura permanece OFF.
- OpenClaw permanece `read-only`; creación de propuestas vía OpenClaw sigue OFF.
- Automatizaciones permanecen desactivadas.
- Journaling no fue accedido durante este cierre.

**Regla de cierre:** Safe Writes Core puede permanecer activo. No repetir E2E de Tareas, Bandeja o
Gym ni la reparación legacy sin evidencia de regresión. Si Core deja de estar ready, hacer
fail-closed y reparar únicamente la frontera observada.

**Siguiente frontera:** Calendar Hold / escritura de Calendar es una capacidad separada. Requiere
una autorización explícita nueva antes de ampliar el OAuth de Calendar o habilitar
`GOOGLE_CALENDAR_WRITE_ID`. OpenClaw proposals y Automatizaciones permanecen fuera de alcance hasta
que esa frontera se trate por separado.

## Apéndice histórico — checkpoint de fuentes canónicas de Production (2026-08-29)

**Registro histórico. No refleja el estado actual de Production.**

Esta sección preserva un checkpoint operativo redactado el 2026-08-29 y recuperado de un clon local
que nunca se commiteó. Refleja el estado certificado _en esa fecha_, inmediatamente después de la
actualización focal de fuentes base, y **puede haber sido superado por checkpoints posteriores** —
en particular por la sección «Activación de fuentes base en Production — 29/08/2026» (versión
ampliada del mismo pass) y por los cierres posteriores «OpenClaw Production — activación final
29/08/2026» y «Safe Writes Core Production — activación final 29/08/2026», que ya dejaron OpenClaw y
Safe Writes Core activos en Production. Las afirmaciones siguientes se conservan sin alterar como
historia; revalidar contra las secciones vigentes antes de actuar.

> ### Fuentes canónicas de Production — cierre 2026-08-29
>
> Estado verificado después de una actualización focal de fuentes:
>
> - Google Sheets Production es el target activo de la aplicación; la fuente sigue siendo Google
>   Sheets y el gate de escritura de hábitos está habilitado únicamente en Production.
> - Se conservaron los datos existentes de Salud y se reconciliaron sólo dos hábitos reales del día
>   actual que faltaban en Production. No se copiaron datos DEV completos ni fixtures.
> - Se preservó un backup recuperable del Sheet Production antes de la reconciliación.
> - Google Calendar quedó autenticado con alcance exclusivamente de lectura; `/agenda` carga eventos
>   reales sin error de autenticación.
> - ActivityWatch local y su tarea existente volvieron a producir las siete métricas del día actual
>   en `Registro diario` Production, sin alterar otras columnas.
> - `/habitos`, `/salud`, `/agenda` y `/productividad` fueron verificados en el deployment Production
>   READY del SHA principal.
> - OpenClaw, automatizaciones, escrituras avanzadas y acceso a Journaling continúan apagados; no se
>   realizaron escrituras en Notion, Calendar ni otros recursos externos fuera de la reconciliación
>   de hábitos autorizada.
> - Production no contiene cambios fuera de las variables y datos descritos arriba.

## Health Intelligence V1 — autorización de despliegue Production 18/09/2026

**Estado: AUTHORIZED / DEPLOYMENT TRIGGER RETRY.**

El merge funcional y el primer merge de trigger no produjeron un deployment Vercel observable.
Se emite este checkpoint directamente sobre `main` como segundo trigger Git, sin cambiar código de
runtime. Production sigue considerándose en la versión anterior hasta observar un deployment nuevo
`READY`.

El usuario autorizó explícitamente desplegar Health Intelligence V1 a Production.

Candidato autorizado:

- `vida-2.0/main` contiene el árbol funcional de Health V1 ya validado.
- El árbol funcional coincide con el candidato que pasó Quality completo y Preview READY antes del
  merge.
- El cambio funcional incluye semántica de calidad de ingestión, Daily Health Brief determinístico,
  baseline personal robusto y contexto sanitario mínimo/no bloqueante para Daily Planning.
- Este pass **no** autoriza cambios en Health Sync / Apps Script / Health Auto Export ni escrituras
  adicionales sobre datos personales.

Gate de recuperación:

- El deployment Production anterior permanece como último punto conocido READY sobre el commit
  `859974106789bfb02abf9152d5a59844bd9f8e15`.
- Si el nuevo deployment no llega a READY, no promover ni declarar Production actualizado.
- Si aparece una regresión runtime después de promoción, detener el cierre y restaurar la última
  versión Production conocida antes de continuar.

Verificación requerida después del deployment:

1. confirmar que Production queda READY sobre el nuevo commit de `main`;
2. hacer smoke checks focales read-only de `/salud` y `/planificacion`;
3. revisar errores runtime del nuevo deployment;
4. no repetir toda la batería de QA pre-merge salvo evidencia de regresión;
5. actualizar este checkpoint sólo con evidencia observada.

## Higiene del archivo

- No pegar secretos, tokens, cookies, credenciales, emails, URLs privadas, payloads personales ni
  IDs sensibles.
- Los estados externos son `LAST_KNOWN` al comenzar una sesión nueva hasta ser revalidados.
- Si cambia la arquitectura o una dependencia por decisión explícita, actualizar este documento y
  también `AGENTS.md` sólo si la decisión pasa a ser una regla durable.
- Este archivo conserva estado operativo; las reglas permanentes viven en `AGENTS.md`.

## World Intelligence V1 — Phase 10 checkpoint (2026-10-04)

**Estado: DONE / Phase 10 cerrada.** PR #150 fue mergeado a `main` y Production quedó
`READY` sobre `27528cd562f855e76c7d7d4df5f652a9368210ed`.

- Neon web funciona y el proyecto aislado `world-intelligence-v1-pilot` permanece en Free ($0),
  sin PAYG, Auth, Functions, Object Storage ni AI Gateway.
- `POSTGRES_SCHEMA_V1.sql` se aplicó y validó; `POSTGRES_SMOKE_V1.sql` devolvió los ocho conteos
  esperados y terminó en `ROLLBACK`; después se verificó que las filas de smoke quedaron en cero.
- Solo existen los dos stubs mínimos de briefs publicados necesarios para la FK de feedback, sin
  cuerpos editoriales ni evidencia pesada.
- La rama de respaldo Free y sin vencimiento
  `world-intelligence-v1-pre-prod-feedback-backup-20261004` preserva el estado previo al E2E.
  Junto con el rollback transaccional verificado satisface la exigencia canónica de al menos una vía
  reversible para el piloto. Un export independiente o restore drill puede hacerse como mejora
  operacional futura, pero no es requisito adicional del gate V1.
- Vercel mantiene `WORLD_DATABASE_URL` como Sensitive, aislada para World. Preview sigue limitado a
  `world-feedback-ui-v1-20261004` y Production usa su entrada Sensitive separada. El adapter ignora
  `DATABASE_URL` y falla cerrado si falta la URL específica.
- Production E2E en `/world/pieza/que-es-entrelazamiento-cuantico`: insert de `USEFUL`, replay
  idéntico idempotente, corrección a `WANT_DEEPER` y read-back después de recargar con la selección
  correcta. Esto certifica insert, read, replay, correction y read-back reales.
- La degradación segura está cubierta determinísticamente por WF6/WF8/WF8a y por el flujo de render:
  el artículo se carga desde el snapshot canónico y un store ausente/error solo vuelve el feedback
  no escribible. No se inyectó deliberadamente una caída en Production porque no agrega evidencia
  proporcional y sí agrega riesgo operativo.
- QA previo: los tests World pasaron; la suite general reportó 1.661/1.662 con un único fallo ajeno
  en `openclaw-plugin-adapter-metadata.test.ts`; typecheck, lint, stylelint, build remoto y checks del
  head de #150 pasaron antes del merge.
- El `redirect_uri_mismatch` de Google en Preview queda como limitación del entorno Preview, no como
  defecto del runtime de feedback; Production autenticada permitió completar el E2E real.

**Decisión de gate:** Phase 10 = `PASS`. No repetir schema, smoke, Production E2E ni provocar una
caída del datastore salvo evidencia de regresión. El siguiente trabajo de World pertenece a
**Phase 11 — prospective evaluation**.

## Tasks + Daily Planning V2 — local Phase F checkpoint (2026-10-08)

**Phase F = OPEN. Phase G = preparation only.** This checkpoint preserves the prior V1
certifications; it does not authorize deployment, schemas, writes or protected merges.

- Verified Vida source baseline: `499a5c1784c99ccb3d9ed78a9259466580d00fa4`.
- Recovered the complete seven-file off-ref candidate
  `1a5b5c1457190085c082e4a1bed24adfed2a1ced` through authenticated Git reads. Applied the reviewed
  four-anchor typed AssessmentProgressSnapshot fixture correction from the owner's ZIP.
- Full local test suite: **1,911 PASS / 0 FAIL / 0 SKIP**. A first Windows-only source-inspection
  failure was resolved by restoring canonical LF checkout bytes; no unrelated code/test fix.
- Local semantic TypeScript, ESLint, Stylelint, full-repository Prettier and Next build: PASS.
  ESLint retains the existing unused `dateInRange` Nutrition warning. The final source SHA is
  recorded separately in the canonical staged PAS #484 execution evidence after publication.
- The original publication safety control must decide whether a single coherent Draft PR can be
  created. Never switch to a different publication channel after rejection.
- Vercel read-only inspection reconfirmed V1 Production READY on the prior release with its three
  existing aliases. No Preview, Production deployment, Sandbox or paid test runner was initiated.
- Actual authenticated exact-candidate source/recovery and academic freshness checks are NOT RUN.
  The isolated checkout has no local source/auth environment; an existing V1 Production browser
  session cannot certify this candidate. Never export its cookies or manufacture authorization.
- Journal positive-path, D-1 scope/revocation and raw-leak audit are NOT RUN; zero Journal reads.
  This engineering request is not a Daily Reality Review trigger. Request separate bounded consent
  only when the authorized QA environment is ready, without loading raw history into reports.
- Authenticated V2 mobile/keyboard/accessibility and effective post-cutover rollback are NOT RUN.
  Retained V1 availability and deterministic flag tests are not an observed rollback rehearsal.
- Habits #204 remains Draft: genuinely serialized/fenced cross-worker Sheets writes and
  crash/retry/ambiguous-response evidence are still required. Writes stay disabled.
- Billing lookup returned `404 Plan not found`; remaining spend/credit is unknown. The documented
  USD 1 team alert is not a hard stop. Do not raise budgets or repeat metered diagnostics.

Next gate: permitted reviewed candidate publication, then authenticated dev/Preview readiness and
bounded real QA. Only after all required gates pass, request specific protected merge and
Production cutover authorizations. Store/schema migration and write activation remain separate
approval scopes. Preserve V1 and record exact outcomes in PAS PR #484 without duplicate state PRs.

## Planning V2 Phase 3 — 2026-10-13 identity/consent preflight

**BLOCKED — authentic ChatGPT ingress and acceptance evidence unavailable.**

- Preserved the clean, local schema-QA commit
  `c7e983f560f8508e6de733b4acbe05cae73031f5`; no destructive checkout/reset.
- Revalidated PAS contracts from canonical main
  `64f7af79f13629f2cc9d1cd08089da203e59d375` and inspected current issuer,
  acceptance contract, Auth.js, OpenClaw and existing history adapters.
- Real Vercel project metadata lookup succeeded; project-connector GET returned
  404 `Connector Project not found`. A registered/live ChatGPT link remains
  unverified. No credentials or alternative identity were used to bypass it.
- No authenticated ChatGPT principal-to-owner mapping, stable per-intent source
  receipt, trusted report source, bound consent resolver or complete association
  history is currently available to the Planning preflight. Web sessions and
  agent HMAC authentication cannot replace ChatGPT-origin evidence.
- Existing focused issuer/acceptance tests: **27/27 PASS, exit 0**, synthetic.
  Runtime-OFF probe: `blocked`, zero session/report/consent/network calls.
- No application code, adapter, endpoint or permission was changed. The prior
  24-test schema subgate was not repeated. All local V2 flags stayed OFF/unset;
  branch autodeployment remained disabled. No push, hosted CI, deployment,
  provider mutation, Production action, Journal access or canary.
- Exact evidence matrix and smallest next adaptation are recorded in
  `docs/planning-v2-execution-acceptance-contract.md`. Verify an authenticated
  ChatGPT-to-existing-Vida ingress and trusted stable intent receipt first;
  bind current opt-in/history only to real evidence. No duplicate user records.

## Planning V2 — Fase 4, Semana / Proyectos / Aprendizaje, 2026-10-14 UTC

- Rama local aislada desde `4a3bee2860de36a39b7a285a2bbd07a5c78d7243`,
  worktree `/workspace/vida-phase4-surfaces-v2`. Los cuatro worktrees previos
  conservan exactamente `4a3bee286…`, `ad9ff877…`, `0acb686…`, `65e415c…`, limpios.
- PAS main leído desde FETCH_HEAD `7347e9144aba7092cc26d697ebefe9048872b5f7`;
  decisión ChatGPT-first y roadmap mantienen `SHADOW_READ_ONLY`.
- Corregido: Semana preserva avisos parciales/de error, expone fecha del resumen,
  y reutiliza `matchSubjectProgress` con el catálogo existente. Un resumen anterior
  a la actualización de la materia ya no demuestra preparación actual; una fecha
  conflictiva se reemplaza por la fecha oficial para clasificar la ventana semanal.
  El catálogo se consulta sólo para Semana V2, en el Promise.all existente.
- Aprendizaje tiene fallback accesible cuando falla catálogo o progreso sin notice;
  un error con snapshots retenidos no publica preparación. Hoy separa métricas de
  Salud independientes de orientación y etiqueta el origen mock como simulado.
- QA focalizada: `node --import tsx --test tests/phase4-v2-surface-render.test.ts
tests/phase4-v2-read-failure-render.test.ts tests/study-engine-catalog.test.ts`:
  43/43 PASS, exit 0 (19 nuevos, 18 renders previos afectados, 6 tests del catálogo
  reutilizado). Typecheck, ESLint de los seis archivos TS/TSX y Prettier: exit 0.
  Un primer typecheck detectó una regexp ES2018 incompatible con el target;
  corregida en el test. Sin cambios SCSS; no build integral ni suites generales.
- Chromium 154: 32 casos únicos PASS, 390x844 y 1440x1000; cinco estados por cada
  vista pendiente y Hoy con Salud independiente. Repetidos sólo casos afectados:
  6 tras ampliar fixtures/etiquetar Salud y 10 de Semana tras reconciliar catálogo.
  Sin overflow cerrado/abierto, aria-labelledby válido, aria-current de Semana,
  Tab en enlaces y Enter en disclosures. Verificación básica, no auditoría WCAG.
  Evidencia visual y runner en `/workspace/scratch/phase4-v2-surfaces/`.
- Alcance: React auténtico + SCSS real con DTOs totalmente sintéticos, banner visible.
  Las server actions no usadas por Semana se sustituyen por rechazos en el harness
  Node para no cargar Auth.js/proveedores. Sin hidratación/router completo ni sesión.
  Proyectos se prueba con su superficie canónica existente; señales V2 E6 siguen OFF.
  E2E autenticado NOT RUN; no fuente privada, Journal ni escritura de proveedor.

| Vista         | Implementado / probado                                                                                                  | Pendiente                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Hoy           | Lecturas fallidas diferenciadas; métricas Salud independientes; renders + Chromium                                      | Auth/frescura real sobre el mismo candidato                         |
| Planificación | Revisión/Prioridades previas; Semana coherente con catálogo, listas largas, fechas tipadas y legacy; renders + Chromium | Router/hidratación y fuentes reales; Acciones no ejercitada aquí    |
| Proyectos     | Renderer canónico, progreso por hitos, vacío/error y PI antiguo; cinco estados desktop/móvil                            | Señales staged OFF; fuente/E2E real                                 |
| Aprendizaje   | Faculty-first, preparación desconocida/antigua, error y fallback; cinco estados desktop/móvil                           | Catálogo/Assessment reales, sesión y navegación completa            |
| Hábitos       | UI/lectores existen en `0acb686…`; QA anterior conservado, sin repetición                                               | Superficie no integrada a este candidato; writer sigue desconectado |

**Dependencias reconciliadas, sin merge:**

- Planning `ad9ff877…` es ancestro de este candidato: conservar sus avisos académicos,
  rechazo de readiness por evidencia incompatible y contratos DEV; ninguna activación.
- Fechas `65e415c…` añade consumidores a `lib/notion/task-date-semantics.ts` existente;
  no duplicar `lib/tasks/date-semantics-v2.ts`. Sus firmas de `selectAttentionTasks`
  y `TasksBoard` agregan opt-in compatible; `selectWeekTasks` no cambia. Su árbol
  completo tiene LearningHub anterior: copiarlo perdería validación/avisos actuales.
- Hábitos `0acb686…` tiene rutas compartidas Hoy/Planificación y LearningHub anterior,
  además de su UI/config/reader/actions propios. Seleccionar dependencias read-only
  requeridas conservando estos renderers; no reemplazar rutas ni árboles completos,
  no conectar `exclusiveWriter` ni activar escritura. Redis no se reinvestigó.

**Decisión:** QA de componentes revisados PASS; Fase 4 integral PARTIAL.
No hay fallo reproducido pendiente en los escenarios de este gate. Antes de QA
integral autenticada falta un único candidato compatible de las cinco vistas:
incorporar selectivamente dependencias read-only de Hábitos y consumidores de fechas,
conservar avisos/validación de este árbol y verificar sesión/binding DEV/SHA exacto.
No afirmar que el Preview existente contiene este commit local ni activar flags.
Todos los flags locales inspeccionados continúan false; sin push, PR, CI, deploy,
Production, secretos, bindings, migraciones o escrituras. Terminar aquí el gate.

## Planning V2 — integración local de cinco vistas, 2026-10-13 (AR)

- Candidato aislado en `/workspace/vida-phase4-integrated-v2`, rama
  `qa/phase4-v2-five-surfaces-20261013`, desde `6257ba399…`.
  PAS main revalidado: `7347e9144aba7092cc26d697ebefe9048872b5f7`.
  Los cinco worktrees aprobados y sus HEADs siguen intactos y limpios.
- Fechas: aplicado sólo el delta revisado de `65e415c…` para semántica y
  consumidores; sin esquema, duplicación de parser, vercel.json ni cambios de flags.
  Las regresiones confirman V1 sin opt-in y V2 sin vencimientos para Objetivo,
  Revisión o fechas legacy ambiguas.
- Hábitos: incorporados contrato/config/lector/UI de `0acb686…`, reconciliados
  como lectura. El lector devuelve siempre writable=false; la UI no importa
  acciones, puertos ni escritor exclusivo y no ofrece alta/toggle/desactivación,
  incluso con un DTO erróneamente editable. Historial y navegación por fecha sí.
  Error no implica ausencia. Cobertura semanal incompleta no aparece como 0/3;
  cobertura completa conserva el cero medido. Sin gate Redis ni suites writer.
- Delta encontrado por Next: `button:disabled` global en TaskManager rompía CSS
  Modules. Acotado a `.manager button:disabled`, conservando el estilo de sus
  controles. Stylelint y compilación Next verifican el selector real.
- QA: 38/38 tests (10 integración, 9 consumidores fechas, 19 renders de superficies
  con el nuevo árbol); exit 0. Typecheck, ESLint/Prettier de archivos incorporados
  o modificados, Stylelint de dos SCSS y build auténtico webpack: exit 0.
  No se repitieron suites independientes de escritor, Redis o consentimiento.
- Next 16 + React 19 local: 50 escenarios de cinco vistas/five estados y 15
  interacciones hidratadas a 390x844 / 1440x1000: 65/65 PASS, exit 0. Sin overflow,
  errores de consola/hidratación, requests externos ni mutaciones. Enter en links,
  menú móvil/Escape/retorno de foco y router.push de fecha Hábitos verificados.
- Límites: rutas de fixture en harness fuera del repo, con componentes reales,
  AppShell, ThemeProvider, CSS Modules y App Router auténticos. No son los handlers
  autenticados leyendo proveedores. El banner declara datos sintéticos y sesión
  ausente; ninguna identidad ni consentimiento fueron fabricados. Server actions
  de Tareas sustituidas por rechazos en el harness; flags de proceso intactos/OFF.
  Rutas del build auténtico `/`, `/planificacion`, `/proyectos`, `/aprendizaje`,
  `/habitos`: GET sin cookie devuelve 307 a login (5/5), sin ampliar acceso.
- Evidencia y comandos reproducibles:
  `/workspace/scratch/phase4-integrated-next/` contiene harness, runner CDP,
  screenshots, browser-results.json, authentic-build.log y preflight de rutas.
  Tests: `node --import tsx --test tests/phase4-v2-integration.test.ts tests/task-date-consumers-v2.test.ts tests/phase4-v2-surface-render.test.ts`.
  Build: `npm run build -- --webpack`, con guard de red local y telemetry deshabilitada.

| Vista         | Resultado local integrado                                                                          | Pendiente real                                           |
| ------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Hoy           | Salud independiente, error Calendar/orientación y no-change sintético; hidratación/navegación PASS | Fuentes actuales y sesión del candidato                  |
| Planificación | Semana/catálogo compatibles, fechas tipadas y Acciones no editable; navegación PASS                | Handler autenticado y datos DEV                          |
| Proyectos     | Renderer canónico con progreso medido/desconocido/error; hidratación PASS                          | Fuentes actuales; señales V2 siguen OFF                  |
| Aprendizaje   | Validación canónica y frescura preservadas; navegación PASS                                        | Catálogo/Assessment y sesión reales                      |
| Hábitos       | Fuente/UI read-only, histórico por fecha, cobertura parcial desconocida; hidratación PASS          | Stores DEV y sesión reales; escritor fuera del candidato |

**Gate local de integración: PASS. Fase 4 real: PARTIAL. E2E autenticado NOT RUN.**
Próximo bloqueo exacto: este candidato sólo existe localmente; falta verificar
sesión, SHA/binding DEV y fuentes actuales en un entorno que pueda mostrar la UI
V2 bajo autorización independiente. No inferir que el Preview existente contiene
este código. Sin push/PR/CI/deploy, migración, Production, secretos, modificación
de flags, escrituras o lecturas de Journal. V2 permanece SHADOW_READ_ONLY.
