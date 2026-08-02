# Unidades n8n del Bloque 5

Hay cinco contratos lógicos y seis unidades programadas inactivas (`active: false`).
`approval-digest` se divide en Mayordomo y Salud para que cada ejecución conserve su credencial,
rate limit, replay, idempotencia, lease y ownership. El JSON lógico anterior no se conserva para
evitar una séptima unidad ambigua.

## Frontera programada

Cada Schedule normaliza `scheduledFor` al minuto y entrega el body exacto
`{ workflowKey, scheduledFor, contractVersion }` al runner de su principal. El runner llama primero
a `POST /api/automations/v1/triggers/scheduled`, obtiene la `runKey` canónica y recién entonces hace
las lecturas o la única propuesta permitida. El cierre se envía a
`POST /api/automations/v1/runs`. Un error posterior a la creación del run produce callback
`failed`; si Vida nunca devolvió una `runKey`, no se fabrica callback.

El trigger manual Web no usa esta frontera: crea el run en Vida y despacha una sola vez a n8n.

## Contrato del runner por principal

Cada manifest referencia una variable `VIDA2_*_RUNNER_WORKFLOW_ID`. Work debe vincularla a un
subworkflow runner exclusivo de ese principal, con una sola credencial HMAC. No se permite un
runner con las seis credenciales ni elegir principal desde datos de ejecución.

El runner implementa `vida2-n8n-principal-runner-v1` y dos acciones cerradas:

- `begin`: recibe `method=POST`, el pathname schedule, el body ya serializado, protocolo, máximo
  tres intentos y la allowlist de status retryable. En cada intento genera timestamp de 13 dígitos,
  request ID nuevo y firma HMAC v2 nueva sobre los bytes exactos. Conserva body y ocurrencia. Devuelve
  exclusivamente `{ scheduleResponse }` con el envelope sanitizado de Vida.
- `execute`: recibe la `runKey`, workflow y lista fija de operaciones del manifest. El runner rechaza
  cualquier operación fuera de esa lista, firma cada request con la misma credencial exclusiva y
  devuelve `{ runKey, outcome }`. `outcome` admite solo `ok`, `proposalKey` opaca cuando corresponda
  y artefacto sanitizado; nunca respuestas crudas, IDs de proveedor ni instrucciones.

Los runners deben usar credenciales n8n para HMAC. Los Code nodes de estos exports no leen `$env`,
secretos ni key IDs; por eso son compatibles con planes Cloud que no exponen variables de entorno
al sandbox. `VIDA2_CONTROLLED_API_BASE_URL` es una variable de instancia para el destino, no un
secreto. El callback usa una credencial `HTTP Header Auth` asignada al nodo después de importar; el
header secreto no está en el export.

## Checklist de Work antes de provisionar

1. Importar las seis unidades y mantenerlas inactivas.
2. Crear o verificar seis runners, cada uno unido a una única credencial HMAC y a la allowlist del
   principal correspondiente.
3. Asignar la variable del runner y la variable de base URL a cada unidad, y vincular al callback su
   credencial `HTTP Header Auth` server-side.
4. Verificar cron y zona `America/Argentina/Cordoba`, body exacto, schedule ingress primero,
   extracción de `runKey`, reads/proposal, DTO terminal y callback de error.
5. Probar retries: solo 429/500/502/503/504, máximo tres, autenticación nueva por intento y misma
   ocurrencia. El callback puede reintentar el mismo request ID porque su idempotencia es propia.
6. Confirmar que no existen nodos directos de Notion, Sheets, Calendar, Gmail, Drive, Journaling ni
   proveedores; planning solo admite `task.create.propose` y no hay approve/reject/execute/rollback.
7. Recién después habilitar la señal de seis unidades provisionadas. Importar JSON o asignar una
   credencial sin pruebas no satisface readiness.
