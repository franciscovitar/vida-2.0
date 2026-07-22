# ADR 0003 — API segura para OpenClaw

- **Estado:** aceptado para 8F.1.
- **Fecha:** 2026-07-22.

## Contexto

OpenClaw será un coordinador conversacional. No puede ser fuente de verdad ni tener
acceso directo a Notion, Sheets, Calendar o secretos. Toda interacción debe pasar
por Vida 2.0 con Policy Engine, privacidad e idempotencia.

## Decisión

1. API versionada `/api/openclaw/v1` detrás de `OPENCLAW_API_ENABLED` (default off).
2. Auth HMAC-SHA256 con headers `X-Vida-*` (sin cookies de usuario).
3. Lecturas tipadas cerradas; escrituras finales prohibidas; solo `proposal.create`.
4. Actor `openclaw:<keyId>`; auditoría ofuscada; DTOs sin IDs/URLs/secretos.
5. Rate limit: puerto local/test o cerrado (sin Redis en esta fase).

## Consecuencias

- Work puede instalar OpenClaw después y apuntarlo a esta API.
- Aprobaciones siguen siendo humanas en `/aprobaciones`.
- Flag apagada → 404; no se construyen clientes externos por el solo hecho de existir la ruta.
