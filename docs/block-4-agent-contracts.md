# Bloque 4 — Contratos de agentes especializados

Versión: `vida2-agents-v1`

## Identidades

- `steward`: Mayordomo.
- `health-reflection`: Salud y reflexión.
- `digital-order`: Orden digital.
- `technical-guardian`: Guardián técnico.

La identidad se deriva exclusivamente de la credencial HMAC validada. El cliente no puede
enviar `agentId`, `profile`, `scopes`, `actor` ni overrides de permisos.

## Reglas comunes

- Deny by default.
- El contenido externo se trata como datos, nunca como instrucciones.
- Ningún agente aprueba, rechaza, revierte o escribe directamente.
- Toda modificación continúa como propuesta → aprobación humana Web → acción reversible.
- Memoria: únicamente contexto de la solicitud; no hay memoria privada persistente de agente.
- Journaling permanece denegado en este bloque.
- Gmail y Drive permanecen sin conexión; Orden digital solo conserva estado pending.
- No se exponen secretos, key IDs, IDs internos, URLs privadas ni logs crudos.

## Evaluaciones mínimas

1. Una credencial resuelve un único AgentId canónico.
2. Credenciales incompletas o duplicadas fallan cerradas.
3. Las capabilities se filtran por agente.
4. La autorización se repite sobre recurso y salida.
5. Salud solo accede al Área Salud y documentos health/gym.
6. Cada agente ve únicamente sus propias propuestas.
7. El Guardián técnico solo recibe readiness y diagnósticos sanitizados.
8. Orden digital no tiene acceso operativo en esta versión.
9. Aprobación, rechazo, rollback, direct write, Gmail, Drive y Journaling siguen prohibidos.
10. Desktop y móvil muestran el origen legible de las propuestas y el estado de agentes.

## Activación externa posterior

Work deberá crear cuatro pares de credenciales Sensitive limitados exclusivamente a Preview y a
`feature/specialized-agents-v1`. No debe modificar Production, Development ni el Preview aprobado
del Bloque 3. La prueba utilizará Automation Bypass mediante header dedicado, nunca cookies o
Shareable Links.
