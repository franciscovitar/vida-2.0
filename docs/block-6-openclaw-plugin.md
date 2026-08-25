# Bloque 6 — Plugin nativo OpenClaw (superficie conversacional local)

Versión de contratos de agente reutilizada: `vida2-agents-v1`. Protocolo HMAC
reutilizado: `vida2-openclaw-hmac-v2`. Este documento cubre únicamente el
código fuente del plugin en el repo; no configura ni instala nada en la
instalación local de OpenClaw.

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
```

El núcleo (`src/*.ts`, excepto `adapter/`) no depende de nada más que
`node:crypto`. Se tipa y se prueba junto con el resto del repo:
`tsc --noEmit` en la raíz lo incluye, y sus pruebas viven en
`tests/openclaw-plugin-*.test.ts` y corren con `npm test`.
`src/adapter/plugin.ts` es el único archivo que importa
`openclaw/plugin-sdk/tool-plugin`, `openclaw/plugin-sdk/core` y `typebox`;
está excluido del `tsconfig.json` raíz y de ESLint raíz porque esas
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

## Frontera HMAC / SecretRef

El plugin nunca contiene un secreto, key ID real, ni referencia con valor.
`configContracts.secretInputs.paths` en `openclaw.plugin.json` declara
`agents.<agentId>.keyId` y `agents.<agentId>.secret` como campos con forma
de secreto para el registro de SecretRef de OpenClaw. Operativamente (paso
posterior de Work, no ejecutado en este bloque), cada credencial se
configura como una referencia (`{"source":"env","provider":"default","id":"..."}`),
y el runtime de OpenClaw la resuelve antes de que el código del plugin la
vea — el adaptador solo lee `config.agents.<agentId>.keyId/secret` ya
resueltos como strings.

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

## Configuración local es un paso posterior de Work

Este bloque no instala el plugin, no crea secretos, no arranca Gateway, no
toca `~/.openclaw`, ni modifica la instalación local de OpenClaw. Ver
`openclaw-plugin/vida-2-0-api/README.md` para los comandos de instalación y
configuración que Work ejecutará más adelante (`openclaw plugins install`,
`openclaw plugins validate`, credenciales SecretRef por agente).

## Rollback

Revertir este bloque es desinstalar/deshabilitar el plugin y su binding de
agente local (`openclaw plugins remove vida-2-0-api`, o simplemente no
activar `tools.allow` para él) y, si se llegó a configurar, retirar las
credenciales `OPENCLAW_<AGENT>_API_KEY_ID/SECRET` del entorno local de
OpenClaw. Ningún dato de Vida cambia: el plugin nunca escribe directamente,
solo puede crear propuestas `pending` a través de la API existente, que ya
requiere aprobación humana Web y ya puede revertirse por los mecanismos del
Bloque 3 (`docs/block-3-reversible-writes.md`). No hay estado del lado de
Vida que este bloque introduzca para revertir.
