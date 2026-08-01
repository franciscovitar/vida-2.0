# Templates n8n del Bloque 5

Estos cinco exports son manifiestos de aprovisionamiento inactivos (`active: false`) y no son
ejecutables tal como están exportados. Sus nodos HTTP son placeholders desconectados a propósito:
el JSON no fabrica una firma HMAC ni un callback válido mediante campos mágicos. El readiness debe
seguir en `templates pendientes` hasta que Work complete y pruebe el helper de firma y las
conexiones en la instancia externa.

## Importación futura

1. Importar un JSON por workflow.
2. Configurar la zona `America/Argentina/Cordoba` y conservar el cron exportado.
3. Agregar antes del nodo HTTP de Vida 2.0 un helper de firma que implemente exactamente
   `vida2-openclaw-hmac-v2`: timestamp de 13 dígitos, request ID nuevo, método, pathname y SHA-256
   de los bytes del body, unidos por saltos de línea y firmados con HMAC-SHA256.
4. Resolver key ID y secreto desde credenciales/variables de n8n; nunca copiarlos al JSON.
5. Generar timestamp, request ID y firma nuevos por intento, conservando la idempotency key de
   negocio. Reintentar solo 429/500/502/503/504 y como máximo tres intentos.
6. Construir el DTO acotado de resultado y conectar el placeholder de callback a
   `POST /api/automations/v1/runs`. Debe generar un request ID nuevo y tomar la autenticación propia
   del callback desde una credencial server-side. El callback no recibe respuestas crudas ni IDs de
   proveedores.
7. Ejecutar los casos de aceptación y rechazo del manifiesto externo, y solo entonces establecer la
   señal de templates provisionados en el deployment autorizado. Importar el JSON por sí solo no
   satisface este paso.

Los placeholders contemplan únicamente HTTP hacia la frontera controlada de Vida 2.0. No incluyen nodos de
Notion, Sheets, Calendar, Gmail, Drive ni Journaling. Cuatro workflows son de solo lectura; la
sugerencia de planificación solo crea `task.create.propose`. Ninguno aprueba, rechaza, ejecuta o
revierte acciones.
