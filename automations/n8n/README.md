# Templates n8n del Bloque 5

Estos cinco exports son plantillas inactivas (`active: false`). No deben activarse hasta que Work
prepare una instancia n8n, cargue variables server-side y valide cada principal por separado.

## Importación futura

1. Importar un JSON por workflow.
2. Configurar la zona `America/Argentina/Cordoba` y conservar el cron exportado.
3. Agregar antes del nodo HTTP un helper de firma que implemente exactamente
   `vida2-openclaw-hmac-v2`: timestamp de 13 dígitos, request ID nuevo, método, pathname y SHA-256
   de los bytes del body, unidos por saltos de línea y firmados con HMAC-SHA256.
4. Resolver key ID y secreto desde credenciales/variables de n8n; nunca copiarlos al JSON.
5. Generar timestamp, request ID y firma nuevos por intento, conservando la idempotency key de
   negocio. Reintentar solo 429/500/502/503/504 y como máximo tres intentos.
6. Conectar el resultado sanitizado a `POST /api/automations/v1/runs` usando la autenticación propia
   del callback. El callback no recibe respuestas crudas ni IDs de proveedores.

Los exports usan únicamente HTTP hacia la frontera controlada de Vida 2.0. No incluyen nodos de
Notion, Sheets, Calendar, Gmail, Drive ni Journaling. Cuatro workflows son de solo lectura; la
sugerencia de planificación solo crea `task.create.propose`. Ninguno aprueba, rechaza, ejecuta o
revierte acciones.
