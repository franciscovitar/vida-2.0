# Bloque 6 — Plugin nativo OpenClaw (superficie conversacional local)

Versión de contratos de agente reutilizada: `vida2-agents-v1`. Protocolo HMAC
reutilizado: `vida2-openclaw-hmac-v2`. Este documento cubre el código fuente
canónico del plugin y registra el estado operativo certificado al cierre de B6.
La instalación local de OpenClaw sigue siendo estado externo: debe revalidarse
antes de actuar y nunca sustituye al repo como fuente de verdad del software.

## Arquitectura

```text
Usuario
  -> OpenClaw TUI local (superficie V1)
    -> un agente OpenClaw aislado por identidad Vida
      -> plugin nativo privado vida-2-0-api (openclaw-plugin/vida-2-0-api)
        -> HMAC vida2-openclaw-hmac-v2
          -> /api/openclaw/v1 existente (sin cambios de Bloque 8F.1)
            -> autorización y límites server-side existentes de Vida
```

Sin Gateway, sin n8n, sin servidor MCP, sin túnel nuevo, sin API nueva de
Vida y sin acceso directo a Notion/Sheets/Calendar desde OpenClaw. El plugin
solo habla con la API OpenClaw existente de Vida, exactamente igual que hoy.

## TUI local es la superficie V1; OpenClaw no es fuente de verdad

La conversación ocurre en el TUI local de OpenClaw. OpenClaw no almacena ni
decide datos de Vida: cada llamada relevante pasa por
`/api/openclaw/v1/read` o `/api/openclaw/v1/proposals`, que siguen aplicando
autenticación, autorización, límites de tamaño, réplica y saneamiento de
salida exactamente como en el Bloque 8F.1. El plugin de este repo es la
fuente canónica de la integración; la instalación local de OpenClaw es
solo runtime — puede reinstalarse o reconfigurarse sin que eso cambie el
comportamiento ni los datos de Vida.

## Identidades canónicas de agente

Cuatro principals OpenClaw, sin excepción: `steward`, `health-reflection`,
`digital-order`, `technical-guardian`. `planner` y `technical-watchdog`
**no** son principals OpenClaw en esta versión y el plugin los rechaza como
agente desconocido si algún día aparecen en un contexto de ejecución.

`digital-order` permanece inerte: su perfil mirror en
`openclaw-plugin/vida-2-0-api/src/agents.ts` no tiene lecturas ni
propuestas, y la fábrica del tool (`adapter/plugin.ts`) devuelve `null` para
ese agente en vez de registrar un tool permanentemente denegado. El servidor
mantiene la misma restricción de forma independiente: aunque el plugin
tuviera un error, `/api/openclaw/v1/read` y `/proposals` siguen rechazando
cualquier operación para `digital-order` porque su perfil real en
`lib/openclaw/agents.ts` también declara cero capacidades.

## Estructura del código

```text
openclaw-plugin/vida-2-0-api/
  package.json            # metadata del paquete del plugin (independiente del repo raíz)
  openclaw.plugin.json    # manifest nativo, contra el schema de openclaw@2026.7.1-2
  tsconfig.json           # NodeNext, propio del plugin
  src/
    types.ts              # contratos cerrados (operaciones, payloads) — mirror manual
    operations.ts         # tabla cerrada operación -> {método, path}
    agents.ts             # mirror local de capacidades (solo affordance, no autoridad)
    canonical.ts          # HMAC v2: canonical string, sha256Hex, firma
    request-id.ts         # generador de X-Vida-Request-Id (UUID v4)
    secrets.ts            # tipo SecretResolver (sin secretos ni implementación real)
    dispatcher.ts         # el único lugar que construye/firma/envía una request
    index.ts              # barrel del núcleo puro (sin dependencia de openclaw/typebox)
    adapter/plugin.ts      # ÚNICO archivo que importa openclaw/plugin-sdk y typebox
    adapter/plugin.integration.test.ts  # arnés real contra el SDK instalado (no forma parte de npm test)
```

El núcleo (`src/*.ts`, excepto `adapter/`) no depende de nada más que
`node:crypto`. Se tipa y se prueba junto con el resto del repo:
`tsc --noEmit` en la raíz lo incluye, y sus pruebas viven en
`tests/openclaw-plugin-*.test.ts` y corren con `npm test`.
`src/adapter/plugin.ts` es el único archivo que importa
`openclaw/plugin-sdk/tool-plugin`, `openclaw/plugin-sdk/agent-runtime` y
`typebox`; está excluido del `tsconfig.json` raíz y de ESLint raíz porque esas
dependencias no están instaladas en el repo web (son peer dependencies del
propio paquete del plugin) y no se instalan como parte de este bloque.

## Mecanismo de plugin verificado contra la instalación local

Se inspeccionó `openclaw@2026.7.1-2` instalado globalmente
(`npm ls -g`) antes de escribir el adaptador, en vez de asumir su API:

- `defineToolPlugin` (`openclaw/plugin-sdk/tool-plugin`) es el mecanismo
  documentado para un plugin cuya única superficie es uno o más tools
  tipados (`docs/plugins/tool-plugins.md` del paquete `openclaw`).
- La identidad de agente confiable solo llega a un tool a través de
  `factory({ config, toolContext })`, donde `toolContext: OpenClawPluginToolContext`
  trae `agentId?: string` provisto por el runtime — nunca por el modelo. Por
  eso el tool `vida_operation` se declara con `factory`, no con `execute`
  plano: la variante `execute` plano no recibe `toolContext` en absoluto.
- Los tools marcados `optional: true` no llegan al modelo salvo
  allowlist explícito (`tools.allow`), y `toolMetadata.vida_operation.optional`
  en `openclaw.plugin.json` mantiene esa metadata alineada.

El parámetro del tool `vida_operation` usa una unión discriminada con un
schema por operación cerrada (`readCall(...)` en `adapter/plugin.ts`), no un
literal de operación genérico más `input: Type.Unknown()`. Una sesión real
de TUI local mostró dos intentos inválidos de `vida_operation` antes de
llegar a una llamada válida porque el contrato genérico anterior no le daba
al modelo una forma exacta para `system.overview` (ni para el resto de
operaciones sin input). Ahora cada operación sin datos exige exactamente
`input: {}`, `areas.get` exige `slug` o `areaKey`, `documents.search` exige
`query`, `document.get` exige `slug`, y cualquier operación desconocida o
con forma incorrecta se rechaza en el propio schema del tool antes de que
el plugin la procese. La validación autoritativa sigue siendo la del
servidor Vida; este cambio solo reduce llamadas exploratorias inválidas.

## Frontera HMAC / SecretRef

El plugin nunca contiene un secreto, key ID real, ni referencia con valor.
`agents.<agentId>.keyId`, `agents.<agentId>.secret` y
`vercelProtectionBypass` son campos con forma de secreto (declarados en
`configContracts.secretInputs.paths` de `openclaw.plugin.json`). En la
instalación certificada se configuraron como SecretRefs; al cierre Work
verificó tres pares HMAC agent-local más el bypass de Preview, todos
indirectos mediante el proveedor DPAPI CurrentUser y sin valores literales
en `openclaw.json`, repo, logs ni handoffs.

**Ciclo de vida verificado contra el runtime real instalado — corregido tras
evidencia real de TUI local** (una sesión real de `openclaw tui --local`
con `steward` demostró que la suposición anterior de este documento —
"OpenClaw siempre entrega a `factory`/`register(api)` un snapshot ya
resuelto" — no se sostiene en esa ruta de ejecución concreta, aunque sí se
sostenía en los diagnósticos aislados de CLI usados para verificarla
entonces):

1. `plugins.entries.vida-2-0-api.config` sigue validándose contra el
   `configSchema` **generado desde el propio `defineToolPlugin` del
   adaptador** usando el valor **crudo, sin resolver**, tal como está en
   `openclaw.json`. Esto se mantiene: cada campo con forma de secreto sigue
   usando el schema TypeBox cerrado `string | SecretRef`
   (`secretInputSchema()` en `adapter/plugin.ts`), nunca `Type.String()`
   puro ni `Type.Unknown()`/`Type.Any()`.
2. Lo que la `factory`/`execute` del plugin reciben para un campo con forma
   de secreto **ya no se asume resuelto**. En diagnósticos aislados de CLI
   (`plugins doctor`, `plugins inspect --runtime`, `config patch --dry-run`)
   llegaba resuelto; en una ejecución real de TUI local
   (`openclaw tui --local`) llegó como objeto `SecretRef` crudo —
   `config.agents.steward.keyId`/`secret` sin resolver — y las tres
   llamadas válidas de `vida_operation` fallaron antes de cualquier
   intento de red porque el secreto HMAC era un objeto, no un string.
3. Por eso el propio adaptador resuelve explícitamente cualquier campo
   crudo, en el momento de uso, llamando al resolvedor público real de
   OpenClaw — `resolveSecretRefValues` de
   `openclaw/plugin-sdk/secret-ref-runtime` — con el `OpenClawConfig`
   completo que `api.config` entrega en cualquier ruta de ejecución
   (`resolveSecretInputValue`/`resolveAgentCredential` en
   `adapter/plugin.ts`). El plugin no reimplementa la resolución de
   SecretRef: solo invoca el resolvedor propio de OpenClaw. Si el valor no
   es ya un string ni un `SecretRef` bien formado, o si la resolución
   falla, la función retorna `null` y la llamada falla cerrada
   (`missing-credential` para credenciales de agente,
   `invalid-configuration` para un bypass configurado pero no resuelto)
   antes de firmar HMAC o intentar red — un objeto `SecretRef` nunca llega
   a convertirse en material de firma.
4. `RawPluginConfig` (`Static<typeof ConfigSchema>`, lo que la `factory`
   realmente recibe: los campos de secreto pueden seguir siendo objetos) y
   `ResolvedPluginConfig` (solo strings, lo que el dispatcher acepta) son
   tipos nombrados y distintos en `adapter/plugin.ts` para que esta
   frontera quede visible en el sistema de tipos. Ya no existe ningún cast
   de "confío en que el host ya resolvió esto".

Verificación real realizada (sin tocar la configuración activa, sin
credenciales reales, sin red): un arnés que reproduce exactamente la forma
real de fallo — `register(api)` invocado con `pluginConfig` conteniendo
objetos `SecretRef` crudos para `agents.steward.keyId`/`secret` y para
`vercelProtectionBypass`, y `api.config.secrets.providers` apuntando a un
proveedor `exec` sintético local (sin red) — confirma que `execute` firma
con un HMAC válido de 64 caracteres hex (`createHmac` lanzaría
`TypeError` si el secreto fuera un objeto) y que el header de bypass se
envía como string. Un perfil OpenClaw aislado adicional
(`openclaw --profile <nombre>`, plugin enlazado con `plugins install
--link`) confirmó por separado que la configuración con SecretRef reales
sigue siendo aceptada por el schema y que un SecretRef inválido o un
objeto arbitrario se siguen rechazando con `invalid config: must be
string`. Ver `openclaw-plugin/vida-2-0-api/src/adapter/plugin.integration.test.ts`
para el arnés committeado (requiere las peer dependencies del plugin;
no forma parte de `npm test` de la raíz).

La firma sigue exactamente el contrato canónico v2 existente:

```text
vida2-openclaw-hmac-v2
timestamp
requestId
METHOD
pathname
sha256Hex(rawBody)
```

El cuerpo POST se serializa una sola vez (`JSON.stringify`); esos mismos
bytes se hashean y esos mismos bytes se envían — nunca se re-serializa. Las
operaciones GET no llevan cuerpo y hashean la cadena vacía. Nunca hay
query string: la URL se construye siempre como `baseUrl + pathname` fijo,
sin interpolar nada proveniente del modelo.

## Preview protegido de Vercel (transporte, no autenticación)

Un Preview exacto de Vercel puede tener Deployment Protection activo. En ese
caso, una request que no la cruce nunca llega a Vida, sin importar si el HMAC
es válido. El plugin admite un valor de bypass fijo y opcional,
`vercelProtectionBypass`, mapeado internamente a un único header fijo:
`x-vercel-protection-bypass` — el mismo contrato ya establecido en el
Bloque 5 (`automations/n8n/README.md`,
`tests/block5-vercel-protection-bypass.test.ts`).

Es exclusivamente transporte hacia Vercel, nunca autenticación hacia Vida:

- Es un SecretRef (`configContracts.secretInputs` en `openclaw.plugin.json`),
  nunca un valor literal en el repo.
- Se agrega después de firmar; nunca forma parte del canonical string HMAC,
  del cuerpo ni de un query string.
- Solo existe ese header fijo — no hay mapa de headers arbitrario ni forma
  de que el modelo lo provea o lo sobrescriba.
- El HMAC `vida2-openclaw-hmac-v2` sigue siendo obligatorio y sin cambios:
  este valor no lo reemplaza ni lo debilita.
- Production no requiere ni obtiene este valor automáticamente por tener
  esta capacidad disponible en el plugin — solo aplica cuando el operador
  configura `baseUrl` contra un Preview con Deployment Protection activo.

## Sin reintentos

El dispatcher hace exactamente un intento de red por llamada. Un fallo de
red ambiguo en una operación de propuesta se reporta como error de red y
nunca se reintenta silenciosamente; no hay bucle de reintento en ningún
punto del código.

## Memoria y transcripciones son contexto desechable

El plugin es sin estado más allá de una request: no escribe `MEMORY.md`,
no persiste memoria diaria, y no implementa memoria OpenClaw propia. Los
transcritos/memoria del propio OpenClaw (si el operador los activa) son
contexto desechable de esa herramienta, no una fuente de verdad de Vida.

## Exclusión de Journaling

No existe operación, alias ni escape genérico de documento/ruta que pueda
alcanzar Journaling. La tabla cerrada `operations.ts` no contiene ninguna
entrada relacionada, y una operación inventada como `journal.read` o
`journaling.get` no resuelve a ninguna ruta (`resolveOperationRoute`
retorna `null`, fail-closed). El límite real sigue viviendo en
`lib/openclaw/agents.ts` (`isOpenClawDocumentEntryAllowed`) del lado
servidor; el plugin no intenta replicarlo, solo no ofrece ningún camino
hacia él.

## No se requiere Gateway/n8n/MCP/túnel

El plugin llama directamente a `https://<host-vida>/api/openclaw/v1/*` vía
HTTPS estándar (fetch inyectable). No hay ningún componente intermedio
nuevo.

## Estado operativo certificado al cierre de B6

La instalación local se configuró y validó contra `openclaw@2026.7.1-2`.
El estado certificado es:

- `steward`: OAuth oficial OpenAI utilizable, `openai/gpt-5.5`, runtime
  model-scoped `openclaw`, sandbox `off`, superficie efectiva exactamente
  `vida_operation`; E2E real `system.overview` con HTTP 200 y `ok=true`.
- `health-reflection`: mismo runtime/modelo y superficie mínima; E2E real
  `gym.summary` con HTTP 200 y `ok=true`.
- `technical-guardian`: mismo runtime/modelo y superficie mínima; E2E real
  `technical.status` con HTTP 200 y `ok=true`.
- `digital-order`: sin OAuth ni credencial Vida, sin `vida_operation`,
  sandbox `all`, inerte.
- Los tres agentes activos fijan explícitamente
  `openai/gpt-5.5 -> agentRuntime.id=openclaw`; B6 no depende del app-server
  administrado de Codex ni de Docker.
- En los agentes activos, `tools.allow=["vida_operation"]` debe coexistir con
  los denies de herramientas host, pero `vida_operation` no puede aparecer
  también en `tools.deny`: el deny prevalece y elimina el tool.
- No se dejó Gateway persistente, TUI, agente/modelo ni n8n ejecutándose al
  cierre.
- Propuestas: 0; escrituras: 0; Journaling: 0; Production sin cambios.
- No se creó `MEMORY.md`, memoria diaria ni memoria cross-agent.
- Quedaron seis sesiones B6 aisladas porque la instalación actual no ofrece
  borrado exacto seguro por sesión. No son fuente de verdad y no deben
  reutilizarse como contexto canónico.

El estado operativo externo puede caducar o cambiar. Antes de reutilizarlo,
leer `docs/WORK-CHECKPOINT.md` y revalidar sólo los gates necesarios; no
repetir los E2E certificados sin evidencia de regresión.

## Rollback

El rollback de B6 consiste en deshabilitar/desinstalar el plugin o retirar su
binding/allowlist de los agentes locales y, si se decide desmontar por
completo el runtime, retirar de forma controlada los OAuth agent-local y los
SecretRefs operativos correspondientes. No borrar ni revelar valores de
secretos durante el rollback. `digital-order` no requiere acción porque ya
permanece inerte.

Ningún dato de Vida cambia por desactivar el plugin: el bridge no escribe
directamente y la autoridad sigue en `/api/openclaw/v1`. Si en el futuro se
habilitan propuestas, seguirán siendo `pending` y sujetas a la política y
aprobación existentes; B6 cerró con propuestas y escrituras desactivadas.
