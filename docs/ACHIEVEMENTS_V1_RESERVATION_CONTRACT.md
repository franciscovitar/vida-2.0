# Logros V1 — reserva persistente de creación (DRAFT)

Este componente **no registra logros**. No hay rutas de escritura, cambios de Production, credenciales ni activación de variables. Continúa PAS PR #572 y Vida PR #247.

## Problema y decisión

La implementación actual de `lib/actions/coordination.ts` utiliza leases de aprobación con TTL, que no garantizan que Notion mantenga unicidad una vez vencido el lease. Las consultas previas de Notion tampoco tienen un índice único por `ClaveEvento`.

Se reutiliza `lib/actions/upstash-rest.ts` (Upstash REST con `EVAL`, timeouts y fail-closed), pero **no** se modifica el runtime global de aprobaciones. Para Logros se añade `lib/achievements/persistent-reservation.ts`:

- Configuración independiente `ACHIEVEMENTS_V1_WRITE_ENABLED === 'true'`, **OFF por defecto**. Requiere `NOTION_ACHIEVEMENTS_DATA_SOURCE_ID` y credenciales de Upstash válidas. No reutiliza IDs de Tareas/Proyectos/Áreas/Hitos.
- Una reserva por `SHA-256(dataSourceId, eventKey)`; no hay datos personales en la clave Redis.
- `EVAL` de Redis usa `SET ... NX` **sin EX/PX ni borrado**. Una sola solicitud gana; las demás reciben `blocked`, incluso después de reiniciar un proceso.
- Respuestas inciertas de Redis son `unavailable`, jamás permiso para escribir. Una reserva incierta queda potencialmente bloqueada hasta conciliación manual.
- No hay liberación automática ni reconexión a Notion desde este componente.

## Frontera de seguridad

Una reserva Redis no es una prueba de que el logro sea real ni una autorización para escribirlo. El futuro escritor deberá autenticar al propietario, validar una aceptación real con el gate del PAS, confirmar autorización **por evento**, obtener la reserva, escribir una vez y verificar Notion. No se puede construir `Permit(exclusive_lease_held=True)` a partir de un booleano del navegador o de texto generado.

**Limitación explícita:** la unicidad entre procesos solo se sostiene si **todos** los escritores que acceden a la misma fuente Notion utilizan la **misma instancia Redis**, el mismo namespace y el mismo `eventKey`. Otro escritor directo desde Notion o un Redis distinto puede duplicar. El bloqueo persistente sacrifica disponibilidad: si Redis registra la reserva y Notion nunca llegó a guardar, un operador debe conciliar sin borrar el historial a ciegas. No hay aún recuperación certificada ante pérdida del almacén Redis o escrituras manuales externas.

## QA y rollout

`tests/achievements-reservation.test.ts` prueba sintéticamente el protocolo mediante un Redis simulado: competencia simultánea de dos solicitudes, replay, reinicio, claves opacas y fallos de transporte. **No prueba un servicio Redis real, ni demuestra exclusividad cross-provider.** Requiere ejecutar el CI completo de Vida.

La integración con el escritor Python del PAS, un flujo manual de conciliación autorizado, prueba de carreras contra un Redis compartido real y QA del recorrido Notion completo son puertas **pendientes**. Nada de esto justifica activar `ACHIEVEMENTS_V1_WRITE_ENABLED`, fusionar PR, habilitar Journal, hacer despliegues o crear un logro real.
