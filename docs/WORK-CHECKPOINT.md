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

## Higiene del archivo

- No pegar secretos, tokens, cookies, credenciales, emails, URLs privadas, payloads personales ni
  IDs sensibles.
- Los estados externos son `LAST_KNOWN` al comenzar una sesión nueva hasta ser revalidados.
- Si cambia la arquitectura o una dependencia por decisión explícita, actualizar este documento y
  también `AGENTS.md` sólo si la decisión pasa a ser una regla durable.
- Este archivo conserva estado operativo; las reglas permanentes viven en `AGENTS.md`.
