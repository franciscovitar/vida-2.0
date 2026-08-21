# Unidades n8n del Bloque 5

Hay cinco contratos lógicos, seis unidades programadas inactivas (`active: false`) y un ingress
manual también inactivo. Además existen seis runners privados externos, uno por principal.
`approval-digest` se divide en Mayordomo y Salud para que cada ejecución conserve su credencial,
rate limit, replay, idempotencia, lease y ownership. El JSON lógico anterior no se conserva para
evitar una unidad programada ambigua.

## Frontera programada

Cada Schedule normaliza `scheduledFor` al minuto y entrega el body exacto
`{ workflowKey, scheduledFor, contractVersion }` al runner de su principal. El runner llama primero
a `POST /api/automations/v1/triggers/scheduled`, obtiene la `runKey` canónica y recién entonces hace
las lecturas o la única propuesta permitida. El cierre se envía a
`POST /api/automations/v1/runs`. Un error posterior a la creación del run produce callback
`failed`; si Vida nunca devolvió una `runKey`, no se fabrica callback.

## Frontera manual

`manual-ingress.json` expone exclusivamente cuatro Webhooks POST fijos: briefing diario, guardián
técnico, revisión semanal y sugerencia de planificación. Approval Digest no tiene ingreso manual
porque sus dos principales no pueden resolverse desde la Web sin ambigüedad. Cada Webhook usa
`Header Auth`; Work debe vincular una credencial cuyo nombre de header sea
`x-vida-automations-secret` y cuyo valor sea el mismo contrato server-only de
`AUTOMATIONS_N8N_WEBHOOK_SECRET`. El export no contiene la credencial ni su valor.

Cada rama valida las ocho claves exactas del DTO de dispatch, liga workflow, principal, referencia
de entorno del runner y operaciones en el propio export, responde inmediatamente
`{ ok: true, accepted: true, requestKey }` y recién después invoca al runner privado. Solo la primera
entrega (`attempt=1`, `trigger=manual`) cruza el gate de ejecución. Un retry válido recibe el ACK
estricto pero termina antes del runner: si se perdió el primer ACK no se duplican lecturas ni
`task.create.propose`; si la primera entrega nunca llegó, la ejecución expira sin efectos en lugar
de intentar una operación ambigua.

## Contrato del runner por principal

Cada manifest referencia una variable de proceso `$env.VIDA2_*_RUNNER_WORKFLOW_ID`. Work debe
inyectarla en el runtime self-hosted y vincularla a un
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

Los runners deben usar credenciales n8n para HMAC. Las expresiones de estos exports solo leen de
`$env` los IDs de runners y `VIDA2_CONTROLLED_API_BASE_URL`, que son configuración no secreta. Los
secretos y key IDs permanecen en Credentials cifradas de n8n y nunca se exponen mediante `$env` ni
se incluyen en el export. El callback usa una credencial `HTTP Header Auth` asignada al nodo
después de importar; el header secreto no está en el export.

La instancia dedicada self-hosted Community 2.32.7 debe arrancar con
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` para permitir estas expresiones. Este override se limita al
runtime B5; no habilita acceso a secretos porque el contrato solo admite las variables
`VIDA2_*_RUNNER_WORKFLOW_ID` y `VIDA2_CONTROLLED_API_BASE_URL`, y no se debilita ningún otro control
de seguridad.

## Checklist de Work antes de provisionar

1. Importar las seis unidades programadas y el ingress manual; mantener los siete exports
   inactivos hasta completar todos los bindings y pruebas.
2. Crear o verificar seis runners, cada uno unido a una única credencial HMAC y a la allowlist del
   principal correspondiente.
3. Inyectar en el proceso los IDs de runner y la base URL aprobados. Vincular la credencial
   `HTTP Header Auth` server-side tanto a los cuatro Webhooks manuales como a los callbacks, siempre
   con el contrato `x-vida-automations-secret` y sin exportar su valor.
4. Verificar cron y zona `America/Argentina/Cordoba`, body exacto, schedule ingress primero,
   extracción de `runKey`, reads/proposal, DTO terminal y callback de error.
5. Probar retries: solo 429/500/502/503/504, máximo tres, autenticación nueva por intento y misma
   ocurrencia. En manual, probar que un retry válido responde pero no vuelve a invocar al runner. El
   callback puede reintentar el mismo request ID porque su idempotencia es propia.
6. Confirmar que no existen nodos directos de Notion, Sheets, Calendar, Gmail, Drive, Journaling ni
   proveedores; planning solo admite `task.create.propose` y no hay approve/reject/execute/rollback.
7. Recién después habilitar la señal de seis unidades provisionadas. Importar JSON o asignar una
   credencial sin pruebas no satisface readiness.
