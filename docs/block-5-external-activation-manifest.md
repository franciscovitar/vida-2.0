# Bloque 5 — manifest de activación externa

Este documento es el inventario sin valores para una única activación posterior a cargo de Work.
No autoriza cambios externos, Production ni acceso a Journaling. Los nombres son server-only y no
deben copiarse a la UI, logs, capturas o tickets públicos.

## Vida 2.0 Preview branch-scoped

Configurar únicamente en Preview y acotado a la rama autorizada:

- compuertas: `AUTOMATIONS_API_ENABLED`, `AUTOMATIONS_ACCESS_MODE`,
  `AUTOMATIONS_WORKFLOW_CONTRACT_VERSION`, `AUTOMATIONS_MANUAL_RUN_ENABLED`,
  `AUTOMATIONS_SCHEDULE_INGRESS_ENABLED`, `AUTOMATIONS_RESULT_CALLBACK_ENABLED` y
  `AUTOMATIONS_N8N_TEMPLATES_PROVISIONED`;
- autorización de Production: mantener `AUTOMATIONS_PRODUCTION_ENABLED=false`;
- cinco kill switches `AUTOMATIONS_*_ENABLED` y cinco pausas `AUTOMATIONS_*_PAUSED`, todos en
  `false` al comenzar;
- URL base y secreto server-only del orquestador;
- URL, token, namespace y clave AES-256-GCM del store dedicado del Bloque 5;
- seis pares HMAC independientes: briefing diario, guardián técnico, revisión semanal, digest
  Steward, digest Salud y sugerencia de planificación;
- API OpenClaw HMAC v2 y controles distribuidos de rate limit/replay listos; schedule ingress no se
  considera disponible con esos controles apagados o bloqueados;
- namespace con prefijo `vida2:automations:` y sufijo de entorno/contrato, distinto del Bloque 4.

Inventario exacto, siempre sin valores:

| Grupo                | Variables                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato global      | `AUTOMATIONS_API_ENABLED`, `AUTOMATIONS_ACCESS_MODE`, `AUTOMATIONS_WORKFLOW_CONTRACT_VERSION`, `AUTOMATIONS_PRODUCTION_ENABLED`                                                                       |
| Fronteras            | `AUTOMATIONS_MANUAL_RUN_ENABLED`, `AUTOMATIONS_SCHEDULE_INGRESS_ENABLED`, `AUTOMATIONS_RESULT_CALLBACK_ENABLED`, `AUTOMATIONS_N8N_TEMPLATES_PROVISIONED`                                              |
| Orquestador/callback | `AUTOMATIONS_N8N_BASE_URL`, `AUTOMATIONS_N8N_WEBHOOK_SECRET`                                                                                                                                          |
| Store dedicado       | `AUTOMATIONS_UPSTASH_REDIS_REST_URL`, `AUTOMATIONS_UPSTASH_REDIS_REST_TOKEN`, `AUTOMATIONS_STATE_NAMESPACE`, `AUTOMATIONS_STATE_ENCRYPTION_KEY`                                                       |
| Kill switches        | `AUTOMATIONS_DAILY_BRIEFING_ENABLED`, `AUTOMATIONS_TECHNICAL_WATCHDOG_ENABLED`, `AUTOMATIONS_WEEKLY_REVIEW_ENABLED`, `AUTOMATIONS_APPROVAL_DIGEST_ENABLED`, `AUTOMATIONS_PLANNING_SUGGESTION_ENABLED` |
| Pausas               | `AUTOMATIONS_DAILY_BRIEFING_PAUSED`, `AUTOMATIONS_TECHNICAL_WATCHDOG_PAUSED`, `AUTOMATIONS_WEEKLY_REVIEW_PAUSED`, `AUTOMATIONS_APPROVAL_DIGEST_PAUSED`, `AUTOMATIONS_PLANNING_SUGGESTION_PAUSED`      |
| HMAC briefing        | `OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID`, `OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET`                                                                                                      |
| HMAC técnico         | `OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_KEY_ID`, `OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_SECRET`                                                                                              |
| HMAC semanal         | `OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_KEY_ID`, `OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_SECRET`                                                                                                        |
| HMAC digest Steward  | `OPENCLAW_AUTOMATION_APPROVAL_DIGEST_STEWARD_API_KEY_ID`, `OPENCLAW_AUTOMATION_APPROVAL_DIGEST_STEWARD_API_SECRET`                                                                                    |
| HMAC digest Salud    | `OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_KEY_ID`, `OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_SECRET`                                                                                      |
| HMAC planificación   | `OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_KEY_ID`, `OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_SECRET`                                                                                            |

Contratos operativos que no se parametrizan desde n8n:

| Workflow                    | Retención | Timeout | Concurrencia |
| --------------------------- | --------: | ------: | -----------: |
| Briefing diario             |      48 h |    90 s |            1 |
| Guardián técnico            |   14 días |    45 s |            1 |
| Revisión semanal            |    7 días |   120 s |            1 |
| Digest de aprobaciones      |      24 h |    45 s |            1 |
| Sugerencia de planificación |    7 días |    90 s |            1 |

No habilitar un workflow hasta que el readiness global y el individual sean `ready`. Preview no
habilita Production de forma implícita.

## n8n

Usar una instancia de preparación aislada y un plan vigente que Work confirme suficiente para seis
principales, baja concurrencia, retención breve y backups. Hay seis JSON ejecutables inactivos para
cinco contratos: Steward y Salud tienen unidades digest separadas. Antes de provisionar, Work debe
vincular cada unidad a su runner exclusivo y probar schedule ingress, operaciones y callback.

En n8n, crear sin valores una variable `VIDA2_CONTROLLED_API_BASE_URL`, una credencial server-only
`HTTP Header Auth` para callback y seis runners con credenciales HMAC separadas (una por principal).
Cada unidad recibe solo el ID variable de su runner. Los nombres/IDs internos quedan en el
inventario privado de Work, no en los exports. No reutilizar runners ni credenciales entre
principales.

| Workflow                    | Cron             | Zona                        |
| --------------------------- | ---------------- | --------------------------- |
| Briefing diario             | `15 7 * * *`     | `America/Argentina/Cordoba` |
| Guardián técnico            | `17 * * * *`     | `America/Argentina/Cordoba` |
| Revisión semanal            | `10 18 * * 0`    | `America/Argentina/Cordoba` |
| Digest Steward              | `15 12,19 * * *` | `America/Argentina/Cordoba` |
| Digest Salud                | `15 12,19 * * *` | `America/Argentina/Cordoba` |
| Sugerencia de planificación | `30 7 * * 1-5`   | `America/Argentina/Cordoba` |

Por cada intento, el runner debe producir timestamp, request ID y firma nuevos, conservar la misma
ocurrencia y leer secretos solo desde su credencial n8n. Debe llamar primero a
`/api/automations/v1/triggers/scheduled` y conservar la runKey que devuelve. El callback debe enviar
exclusivamente el DTO sanitizado. Activar uno por vez, conservar ejecución
manual durante la prueba, fijar retención/pruning al mínimo operativo, verificar backup de la
configuración sin secretos y documentar el apagado. No instalar nodos de Notion, Sheets, Calendar,
Gmail, Drive ni Journaling.

## Upstash

Crear un recurso dedicado al Bloque 5. Work debe validar el plan y costo vigentes antes de autorizar;
el perfil esperado es bajo volumen pero requiere comandos REST con `SET NX`, sorted sets, TTL y
`EVAL`. No reutilizar URL, token, base de datos ni namespace del Bloque 4. Configurar alertas/cuotas
sin copiar bodies y confirmar que los argumentos observables solo contienen claves opacas, hashes y
ciphertext.

## OAuth y login

Bloque 5 no agrega callbacks OAuth. No modificar el cliente ni los callbacks existentes de Calendar.
La prueba Web usa el login ya aprobado mediante alias estable y una sesión autorizada; no registrar
correos en este manifest.

## Datos externos

Se permiten fixtures DEV sintéticas de tareas, proyectos, áreas, calendario, estado técnico y
propuestas pendientes, sin filas reales del catálogo. No usar datos productivos, correos, IDs de
proveedor, mensajes, compras, Gmail, Drive ni contenido privado. Journaling queda totalmente fuera y
no debe consultarse ni siquiera para preparar el QA.

## Rollback exacto

1. Apagar los seis schedules en n8n y confirmar que no quedan ejecuciones activas.
2. Poner los cinco kill switches y la compuerta global en `false`.
3. Apagar schedule ingress, callback y ejecución manual; mantener Production no autorizada.
4. Revocar las seis credenciales HMAC y el secreto del callback/orquestador.
5. Retirar del Preview URL/token/clave/namespace del store y variables de n8n.
6. Apagar o eliminar el deployment Preview solo dentro de la autorización de Work.
7. Retirar fixtures DEV creadas para el QA, sin búsquedas globales ni acceso a Journaling.
8. Conservar los registros terminales cifrados hasta su TTL; no es necesario borrarlos para cerrar.
9. Si corresponde, retirar el recurso dedicado solo después de verificar expiración/backups y con
   autorización explícita.
