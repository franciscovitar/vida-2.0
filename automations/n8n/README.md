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

Cada rama valida las ocho claves exactas del DTO de dispatch y liga workflow, principal, referencia
de entorno del runner y operaciones en el propio export. Antes de devolver el ACK llama a
`POST /api/automations/v1/deliveries/claim` con la misma identidad canónica. Vida registra de forma
atómica la primera entrega efectiva de la `runKey` en el store dedicado: el primer request que logra
reclamarla recibe `shouldExecute=true`; un retry del mismo request de claim conserva ese permiso para
poder superar una respuesta de red perdida; un intento posterior de Vida con otro `requestKey`
recibe `shouldExecute=false`. Recién después n8n responde
`{ ok: true, accepted: true, requestKey }` y el gate decide si invoca al runner privado.

Así, si `attempt=1` nunca llega a n8n, `attempt=2` puede convertirse en la primera entrega efectiva y
ejecutar una vez. Si el primer intento sí reclamó la ejecución pero se perdió su ACK, los intentos
posteriores reciben ACK sin volver a cruzar el runner. El claim usa el mismo store cifrado e
idempotente de automatizaciones y no agrega otra base de datos ni otra credencial.

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

Los runners deben usar credenciales n8n para HMAC. Las expresiones regulares de estos exports leen
de `$env` los IDs de runners y `VIDA2_CONTROLLED_API_BASE_URL`. Los secretos de Vida y los key IDs
permanecen en Credentials cifradas de n8n y no se incluyen en el export. El ingress manual usa la
misma credencial `HTTP Header Auth` en Webhooks, nodos de delivery claim y callbacks; el header
`x-vida-automations-secret` no está en el export.

Preview protegido agrega una única excepción de transporte: `VERCEL_AUTOMATION_BYPASS_SECRET`.
Debe generarse en Deployment Protection de Vercel, inyectarse solo en el proceso B5 local y enviarse
exclusivamente como header `x-vercel-protection-bypass` en toda llamada saliente que cruce esa
protección hacia `VIDA2_CONTROLLED_API_BASE_URL`: los cuatro delivery claims y los cuatro callbacks
del ingress manual, y también la llamada `execute` de cada uno de los seis runners privados (el nodo
que llama de vuelta a Vida, p. ej. lecturas `POST /api/openclaw/v1/read`). Omitir el header en los
runners produce `401` de Vercel indistinguible de un fallo de aplicación. Nunca debe escribirse en
GitHub, en el JSON del workflow, en URLs, bodies, logs o el checkpoint. Si se creó solo para el E2E,
debe revocarse al terminar.

La instancia dedicada self-hosted Community 2.32.7 debe arrancar con
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` para permitir estas expresiones. El runtime B5 queda limitado a
los IDs de runner, la base URL y, solo cuando Preview está protegido, el bypass revocable de Vercel.
No se habilitan otros secretos por `$env` ni se debilita ningún otro control de seguridad.

## Checklist de Work antes de provisionar

1. Importar las seis unidades programadas y el ingress manual; mantener los siete exports
   inactivos hasta completar todos los bindings y pruebas.
2. Crear o verificar seis runners, cada uno unido a una única credencial HMAC y a la allowlist del
   principal correspondiente.
3. Inyectar en el proceso los IDs de runner y la base URL aprobados. Vincular la credencial
   `HTTP Header Auth` server-side a los cuatro Webhooks manuales, los cuatro delivery claims y los
   cuatro callbacks, siempre con el contrato `x-vida-automations-secret` y sin exportar su valor.
4. Verificar cron y zona `America/Argentina/Cordoba`, body exacto, schedule ingress primero,
   extracción de `runKey`, reads/proposal, DTO terminal y callback de error.
5. Probar retries: solo 429/500/502/503/504, máximo tres, autenticación nueva por intento y misma
   ocurrencia. En manual, comprobar que el primer intento que llega efectivamente puede reclamar la
   ejecución aunque sea `attempt=2/3`, que un retry del mismo claim conserva el permiso y que un
   request posterior de Vida responde sin volver a invocar al runner. El callback puede reintentar
   el mismo request ID porque su idempotencia es propia.
6. Confirmar que no existen nodos directos de Notion, Sheets, Calendar, Gmail, Drive, Journaling ni
   proveedores; planning solo admite `task.create.propose` y no hay approve/reject/execute/rollback.
7. Recién después habilitar la señal de seis unidades provisionadas. Importar JSON o asignar una
   credencial sin pruebas no satisface readiness.
8. Si Preview está protegido, vincular `x-vercel-protection-bypass` (valor
   `$env.VERCEL_AUTOMATION_BYPASS_SECRET`) también en el nodo `execute` de cada uno de los seis
   runners que llama de vuelta a Vida, no solo en el ingress manual. Los seis runners no tienen
   fuente canónica en este repositorio (viven en el inventario privado de Work); confirmar el header
   directamente en cada runner desplegado.
