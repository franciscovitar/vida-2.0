# Vida 2.0 — Work checkpoint

Este archivo es el handoff durable para retomar setup externo y validaciones E2E sin depender de la
memoria del chat. **No es una fuente de verdad en vivo.** Todo dato volátil debe revalidarse antes de
actuar.

## Cómo usar este checkpoint

Al retomar trabajo:

1. leer este archivo antes de rehacer setup;
2. revalidar sólo los datos volátiles necesarios para el siguiente gate;
3. conservar los componentes ya verificados como correctos;
4. reparar el primer blocker real, no reconstruir el flujo completo;
5. ejecutar el E2E final únicamente cuando readiness vuelva a `PASS`;
6. actualizar este archivo al terminar o pausar, sin secretos ni datos sensibles.

Estados recomendados:

- `VERIFIED`: comprobado en la sesión actual mediante evidencia observable;
- `LAST_KNOWN`: último estado registrado, todavía no revalidado en la sesión actual;
- `BLOCKED`: hay un blocker conocido que impide avanzar;
- `DONE`: gate completado y no requiere repetición salvo que cambie una dependencia;
- `UNKNOWN`: falta evidencia actual.

## Bloque 5 — estado de cierre

**B5 = DONE.**

### Evidencia final

- E2E funcional de Briefing diario: `PASS`.
- Resultado terminal en Vida: `status=succeeded`, `resultCode=completed`,
  `summary="Briefing completado."`.
- Las cinco lecturas autorizadas de OpenClaw respondieron `ok=true`.
- Artefacto de briefing sanitizado y acotado persistido (no `null`).
- Dispatches manuales duplicados: 0.
- Propuestas creadas: 0.
- Escrituras externas no intencionadas: 0.
- Los seis workflows programados permanecieron inactivos durante todo el ciclo (`schedules=0`).
- Conteo final de ejecuciones n8n: 33.
- Production sin cambios.

### Cleanup aplicado

- Manual ingress: unpublished.
- Los seis workflows programados: inactivos.
- Runtime dedicado de n8n B5: detenido.
- Puerto 5678: cerrado.
- Tailscale Funnel: apagado.
- Historial/evidencia de ejecuciones: preservado (no se borró ninguna ejecución, workflow ni
  credencial).

### Dependencias temporales de Preview

- El store temporal de automatizaciones de B5 usado durante la validación puede seguir existiendo o
  haber expirado; no se revalidó al cierre.
- El store temporal de seguridad de OpenClaw usado durante la validación puede seguir existiendo o
  haber expirado; no se revalidó al cierre.
- Puede quedar algún recurso temporal huérfano de sesiones anteriores.
- La disposición de estos recursos queda diferida intencionalmente.
- Ninguno de estos ítems debe tratarse como verdad vigente: revalidar antes de cualquier uso futuro.
- Este archivo nunca contiene credenciales, URLs, tokens ni valores de secretos.

## Próxima acción canónica

**No repetir el E2E de B5 sin evidencia de regresión.** El siguiente paso canónico del producto es:

**B6 — experiencia conversacional local completa de OpenClaw.**

## Higiene del archivo

- No pegar secretos, tokens, cookies, credenciales, emails, payloads privados ni IDs sensibles.
- Los estados `LAST_KNOWN` caducan conceptualmente al comenzar una nueva sesión: primero se
  revalidan, después pueden promoverse a `VERIFIED`.
- Si una dependencia cambia de herramienta o arquitectura por decisión explícita, actualizar este
  documento y también `AGENTS.md` si la decisión pasa a ser una regla durable.
- Este archivo conserva estado operativo; las reglas permanentes viven en `AGENTS.md`.
