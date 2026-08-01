# ADR-005 — Automatizaciones controladas

## Estado

Aceptado para implementación en Preview. Production permanece fuera de alcance.

## Contexto

Vida 2.0 ya cuenta con agentes especializados, API HMAC v2, lectura sanitizada,
propuestas reversibles, aprobación humana, rate limit, replay, idempotencia,
cifrado y auditoría.

El Bloque 5 agrega orquestación programada sin convertir a n8n en un actor
omnipotente.

## Decisión

- n8n actúa únicamente como orquestador.
- Cada principal de workflow tiene una credencial HMAC independiente.
- Cada principal conserva un agente canónico como techo de permisos.
- El permiso efectivo es la intersección entre el perfil del agente y el contrato
  inmutable del workflow.
- Rate limit y replay se particionan por principal, no solo por agente.
- Las propuestas de workflows conservan ownership exacto por principal.
- Aprobar, rechazar, ejecutar y revertir continúa siendo exclusivo de la Web.
- Gmail, Drive, Journaling, mensajes, compras, eliminaciones y Production quedan
  fuera del MVP.
- Los workflows nacen apagados y requieren kill switch global e individual.

## MVP

| Workflow                    | Agente canónico               | Lecturas                                                | Propuestas               |
| --------------------------- | ----------------------------- | ------------------------------------------------------- | ------------------------ |
| Briefing diario             | Mayordomo                     | sistema, tareas, proyectos, agenda y propuestas propias | ninguna                  |
| Guardián técnico            | Guardián técnico              | estado y diagnósticos técnicos sanitizados              | ninguna                  |
| Revisión semanal            | Mayordomo                     | áreas, tareas, proyectos y agenda                       | ninguna                  |
| Resumen de aprobaciones     | Mayordomo / Salud y reflexión | propuestas propias de cada principal                    | ninguna                  |
| Sugerencia de planificación | Mayordomo                     | tareas y agenda                                         | crear propuesta de tarea |

Los cinco workflows se materializan como seis principales HMAC. El resumen de
aprobaciones usa un principal para Mayordomo y otro para Salud y reflexión; no
comparten credencial, rate limit, replay ni ownership.

## Barreras de ejecución

- La identidad se resuelve únicamente desde la credencial server-side. El body no
  puede elegir agente, workflow, principal ni permisos.
- Las credenciales directas de agentes continúan funcionando y no heredan
  propuestas creadas por sus workflows.
- La fuente de una propuesta de workflow sigue el contrato
  `agent:<agent-id>:workflow:<principal-key>`.
- Capabilities, lecturas y propuestas aplican la intersección del perfil canónico
  con el contrato del workflow.
- `proposal-only` habilita las lecturas contratadas y, únicamente donde el contrato
  lo permite, creación de propuestas. Nunca habilita escritura directa.
- Obtener una propuesta individual, aprobar, rechazar, ejecutar o revertir no forma
  parte de ningún contrato de workflow.

## Configuración fail-closed

- La compuerta global, el modo de acceso y los cinco kill switches nacen apagados.
- La versión del contrato debe coincidir exactamente con
  `vida2-automations-v1` para habilitar una credencial de workflow.
- La ausencia completa de credenciales de automatización es válida mientras el
  sistema está apagado.
- Un par key/secret incompleto o una key ID duplicada invalida la resolución de
  credenciales completa.
- Los nombres y placeholders están documentados en `.env.example`; no se guardan
  secretos en el repositorio.

## Fuera de alcance

No se agregan workflows n8n reales, endpoints nuevos de proveedores, OAuth,
despliegues ni cambios en Vercel o Upstash. Gmail, Drive, Journaling, mensajes,
compras, eliminaciones y Production continúan fuera del alcance.

## Persistencia futura

El estado de ejecuciones y artefactos sanitizados utilizará un Redis dedicado del
Bloque 5, separado del Upstash congelado del Bloque 4.

## Consecuencias

- Se agregan seis principales HMAC para cinco workflows.
- El principal `approval-digest` se divide por agente para impedir mezcla de
  ownership.
- Los reintentos regeneran timestamp, request ID y firma, pero conservan la
  idempotencyKey de negocio.
- No se reutilizan credenciales directas de proveedores dentro de n8n.
