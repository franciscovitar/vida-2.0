# Bloque 5 — plan final de QA real para Work

Objetivo: una sola ventana de QA, secuencial y fail-fast. Cada paso requiere evidencia sanitizada;
ante un fallo se apagan las compuertas y se ejecuta rollback antes de continuar. Está prohibido hacer
búsquedas globales, leer Journaling, usar datos productivos o ampliar permisos.

## Secuencia

1. **Preflight local.** Verificar rama/SHA aprobados, suite completa, audit, diff limpio, sin
   `.env.local`, secretos ni cambios de lockfile.
2. **Autorización única.** Registrar responsable, ventana, Preview branch-scoped, recursos permitidos
   y criterio de cierre. No autorizar Production.
3. **Upstash dedicado.** Crear/seleccionar el recurso separado, validar plan/costo/cuotas y cargar
   namespace y AES-256-GCM sin reutilizar el Bloque 4.
4. **n8n.** Importar las seis unidades programadas y el ingress manual, todos inactivos. Vincular
   los IDs de runners y base URL mediante el entorno no secreto del proceso, cada runner HMAC
   exclusivo y la credencial Header Auth de Webhooks/callback. Validar
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, conexiones, pruning y backup. Mantener schedules e ingress
   sin publicar.
5. **Variables Preview.** Cargar las compuertas apagadas, store, orquestador, callback y seis pares
   HMAC desde el manifest; revisar pares parciales/duplicados.
6. **Deploy exacto.** Desplegar únicamente el SHA de cierre certificado y registrar ese SHA.
7. **Readiness.** Con workflows apagados esperar `disabled`; completar infraestructura, schedule
   ingress y manual ingress. Marcar templates provisionados solo después de probar los siete exports,
   ambos digest y los seis runners; exigir todos los checks antes de `ready`.
8. **Smoke manual.** Publicar únicamente el ingress manual, habilitar global/manual y un workflow de
   un principal; iniciar con sesión Web y confirmación. Verificar path fijo, Header Auth, ACK estricto
   antes de 10 s, disabled/loading, no doble submit y resultado sanitizado. Repetir el mismo run como
   retry y comprobar que responde sin segunda invocación del runner.
9. **Schedules controlados.** Activar una unidad por vez: schedule ingress debe crear el run y
   devolver runKey sin redispatch. Observar una única ejecución y apagar ante anomalías.
10. **Inventario 6 + 1 + 6.** Certificar seis unidades schedule, un ingress manual y seis runners
    privados. Verificar cron/zona, contrato, principal, artefacto y retención; probar los dos digest
    simultáneos sin colisión ni cruce de ownership.
11. **Proposal-only.** Para planificación exigir una sola `task.create.propose`, pendiente y sin
    ejecución automática; el resto no puede proponer.
12. **Ownership.** Verificar source exacto del principal y que agentes/workflows distintos no puedan
    listar ni obtener la propuesta.
13. **Idempotencia/replay.** Repetir el mismo evento y callback: mismo run/resultado, sin segundo
    artefacto ni propuesta. En manual, un retry válido no debe cruzar el runner y un payload
    divergente debe rechazarse.
14. **Retry/circuit breaker.** Inducir respuestas retryables acotadas; comprobar tres intentos,
    request ID/firma nuevos, idempotency key estable, apertura, bloqueo y recuperación half-open.
15. **Store cifrado.** Inspeccionar métricas/comandos permitidos: namespace dedicado, TTL positivo,
    claves opacas/ciphertext y cero plaintext, runKey cruda, emails, URLs o IDs de proveedor.
16. **Callback.** Ejecutar matriz válida y negativa de método, query, content type, UTF-8, tamaño,
    auth, replay, identidad, transición y store unavailable; nunca debe aparecer un stack trace.
17. **UI.** Revisar `/automatizaciones`, `/ajustes` y `/aprobaciones` en desktop y 390×844: sin scroll
    horizontal, estados canónicos iguales, foco/labels/aria, loading, origen legible y cero datos
    técnicos/sensibles.
18. **Kill switches.** Probar pausa/reanudación, kill switch individual y global. Cada apagado debe
    impedir nuevos triggers sin borrar ejecuciones terminales.
19. **Limpieza.** Despublicar el ingress manual, apagar schedules, retirar fixtures DEV y cerrar
    sesiones de prueba. No hacer búsquedas globales ni consultar Journaling.
20. **Rollback.** Ejecutar el orden del manifest si cualquier evidencia falla; revocar credenciales y
    apagar Preview dentro de la autorización.
21. **Certificación.** Registrar SHA, checks, cinco workflows, seis principales, evidencia sanitizada,
    costos observados, incidentes y confirmación de cero Production/direct writes/Journaling.

## Criterio fail-fast

Detener la ventana ante cualquier readiness distinto del esperado, credencial parcial/duplicada,
reutilización del store, URL insegura, secreto en salida, ejecución doble, proposal ownership
incorrecto, write directo, callback no acotado o diferencia entre SHA desplegado y certificado.
No “arreglar en vivo”: volver a compuertas apagadas, corregir localmente y solicitar una nueva
autorización.
