# Vida 2.0 — Work checkpoint

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

## Higiene del archivo

- No pegar secretos, tokens, cookies, credenciales, emails, URLs privadas, payloads personales ni
  IDs sensibles.
- Los estados externos son `LAST_KNOWN` al comenzar una sesión nueva hasta ser revalidados.
- Si cambia la arquitectura o una dependencia por decisión explícita, actualizar este documento y
  también `AGENTS.md` sólo si la decisión pasa a ser una regla durable.
- Este archivo conserva estado operativo; las reglas permanentes viven en `AGENTS.md`.
