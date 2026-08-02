# Bloque 5 — runtime de automatizaciones controladas

## Store cifrado

Ejecuciones, artefactos, controles e idempotencia viven en un namespace dedicado que debe comenzar
con `vida2:automations:`. El runtime real requiere URL/token REST propios, namespace y una clave de
32 bytes en base64. Todo registro se cifra en el cliente con AES-256-GCM antes de llegar a Redis;
las claves Redis son hashes opacos. Corrupción, clave incorrecta, envelopes legados o formas con
campos desconocidos fallan cerrados. La implementación en memoria solo se construye explícitamente
en tests; nunca es fallback de runtime.

El TTL de cada ejecución y artefacto proviene del contrato inmutable del workflow. Los índices
contienen solamente hashes; la correspondencia con cada `runKey` está cifrada en una entrada
separada. Ningún argumento Redis contiene la `runKey` en claro. Ningún body, firma, key ID, token,
correo, URL privada, ID de proveedor o contenido de Journaling forma parte del registro.

## Runtime y kill switches

Una ejecución pasa por `queued → running → succeeded|failed|skipped|cancelled`. La identidad se
resuelve server-side desde el principal del contrato. `beginRun` concentra flags, contrato,
credencial, pausa/circuito, idempotencia, creación y lease, sin llamar al orquestador. Antes de
iniciar se verifican, en orden:

- compuerta global, versión de contrato y modo de acceso;
- kill switch individual y pausa local del workflow;
- credencial HMAC independiente del principal;
- store y cliente n8n válidos;
- idempotencia y lease de concurrencia por principal;
- circuit breaker del workflow.

Tres fallos consecutivos abren el circuito durante 15 minutos. Después se admite un intento
half-open; un resultado exitoso vuelve a `closed`. La pausa visual solo modifica el control cifrado
del Bloque 5 y no toca proveedores ni configuración externa.

El inicio manual Web usa esa operación y después despacha una única vez a n8n; solo los fallos de
ese despacho aplican sus retries acotados sobre el mismo run. El inicio schedule usa la misma
operación y nunca llama a `n8n-client`, evitando recursión. No existe código para aprobar, rechazar,
ejecutar o hacer rollback. El workflow de planificación puede terminar con una única referencia
opaca a una propuesta pendiente; cualquier decisión sigue siendo Web.

## Ingreso schedule

`POST /api/automations/v1/triggers/scheduled` nace apagado mediante
`AUTOMATIONS_SCHEDULE_INGRESS_ENABLED`. Reutiliza HMAC v2 y las seis credenciales existentes. La
credencial resuelve agente, workflow y principal server-side; el body exacto contiene solo
`workflowKey`, `scheduledFor` UTC canónico y versión de contrato. Método, query, content type,
UTF-8, tamaño, JSON, campos, cron/zona, ventana de 15 minutos, workflow, flags, templates,
Production, rate limit y replay se validan fail-closed.

La idempotencia de negocio se deriva de contrato, workflow, principal y ocurrencia normalizada; el
digest de bytes detecta payload divergente. Un retry HMAC válido con request ID/firma nuevos recibe
la misma `runKey`. La respuesta y el log contienen solo estado, versión, trazas opacas y la runKey
necesaria para continuar. Timeout y todo resultado terminal liberan el lease del principal.

## Callback

`POST /api/automations/v1/runs` nace apagado. Requiere `application/json`, UTF-8 válido, body máximo
de 16 KiB, request ID acotado y el secreto separado del orquestador comparado en tiempo constante.
Rechaza query params, claves duplicadas, campos desconocidos, transiciones inválidas y texto que
parezca contener secretos, correos, URLs o Journaling. La respuesta contiene solo `runKey`, estado e
indicador de replay. Los logs usan un hash corto de la ejecución.

## Interfaz Web

`/automatizaciones` requiere sesión autorizada. “Ejecutar ahora” además requiere flag manual,
confirmación explícita, sistema/workflow listos y un único principal resoluble. El cliente nunca
envía principal, scopes ni permisos. El digest de aprobaciones tiene dos principales y por eso no
ofrece ejecución manual. `/ajustes` muestra únicamente estado sanitizado. `/aprobaciones` traduce el
source técnico de planificación a un origen legible sin alterar ownership.

## Rollback y límites del MVP

Rollback operativo consiste en apagar la compuerta global o el kill switch individual y, si hace
falta, pausar el workflow. Los registros expiran por TTL; no se borran proveedores ni se cambian
arquitecturas. Fuera del MVP quedan Production, deploy, alta/edición de n8n o Upstash, OAuth, acceso
directo a proveedores, Gmail, Drive, Journaling, mensajes, compras, eliminaciones y cualquier
aprobación automática.

Los JSON de `automations/n8n` son seis unidades ejecutables inactivas para cinco contratos lógicos.
Los dos digest son unidades separadas. Cada una define schedule → runner HMAC del principal →
schedule ingress → runKey → operaciones contratadas → DTO terminal/error → callback. Readiness
permanece pendiente hasta que Work vincule y pruebe seis runners con credencial única, el callback y
las variables de instancia. Esa preparación externa no forma parte de este commit.
