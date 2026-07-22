# ADR 0002 — Runtime real de escrituras seguras (8E.1 hotfix)

- **Estado:** aceptado para 8E.1.1.
- **Fecha:** 2026-07-22.

## Contexto

8E.1 entregó Policy Engine, payloads, handlers y UI detrás de `WRITE_ACTIONS_ENABLED`, pero el
runtime seguía devolviendo puertos `notConfigured` y usaba memoria de proceso para propuestas,
idempotencia y auditoría. En Vercel serverless eso bloquea la validación real de Work.

## Decisión

1. **Flag apagada:** no construir clientes de escritura; puertos cerrados; sin I/O externo.
2. **Flag activa + config incompleta:** fallo cerrado sanitizado (`misconfigured` / `not-configured`).
3. **Flag activa + config completa en Preview/Production:** adaptadores reales Notion/Sheets;
   ledger persistente en la base Acciones para propuestas, idempotencia y auditoría.
4. **Memoria:** solo tests (`NODE_ENV=test` en el env inyectado) o
   `WRITE_ACTIONS_USE_MEMORY=true` fuera de Preview/Production. Nunca fallback silencioso allí.
5. **Lectura Notion:** con escrituras reales, `NOTION_DATA_SOURCE` debe ser `notion` (no mezclar
   mock de lectura con escritura real).
6. **Claves al cliente:** opacas; sin UUID de Notion ni URLs internas.
7. **Idempotencia Notion:** consulta previa + digest determinista + comprobación posterior.
   Notion no ofrece unicidad atómica; concurrencia extrema puede duplicar filas raramente.

## Consecuencias

- Work puede validar Preview con variables ya preparadas sin cambiar Production.
- Tests usan clientes SDK falsos; no tocan Notion/Sheets reales.
- `getWriteRuntimeStatus()` expone solo estados ready/disabled/misconfigured (sin secretos).
